import { StableBTreeMap, Principal, nat64, ic, Opt, int8, int32, Vec, text, None, Canister, init, query, Some, update, Result, Err, Ok, Duration, bool, AzleVec } from 'azle';
import {
    Ledger, binaryAddressFromAddress, binaryAddressFromPrincipal, hexAddressFromPrincipal
} from "azle/canisters/ledger";
import { Player, Lottery, LotteryPayload, BuyTicketPayload, QueryPayload, AddressPayload, LotteryConfiguration, Message, Order } from './types';
//@ts-ignore
import { hashCode } from "hashcode";
import { v4 as uuidv4 } from 'uuid';

// mapping to hold storage information 
const lotteryStorage = StableBTreeMap(0, int32, Lottery);

// player index mapping to show which lottery they participated in which they hold in tickets
let playerIndexMap = StableBTreeMap(1, Principal, Vec(text));

// follow up mapping that connects the player unique id, to player position in lotteries
let indexToPosnMap = StableBTreeMap(2, text, int32);

// orders for mapping
const persistedOrders = StableBTreeMap(3, Principal, Order);
const pendingOrders = StableBTreeMap(4, nat64, Order);

const ORDER_RESERVATION_PERIOD = 120n; // reservation period in seconds


// custom configuration settings
let currlotteryId : Opt<int32> = None;

let lotteryState : Opt<int8> = None;

let ticketPrice : Opt<nat64> = None;

let lotteryDuration: Opt<nat64> = None;

let prizePool: Opt<nat64> = None;

/* 
    initialization of the Ledger canister. The principal text value is hardcoded because 
    we set it in the `dfx.json`
*/
const icpLedgerCanister = Ledger(Principal.fromText("ryjl3-tyaaa-aaaaa-aaaba-cai"))

export default Canister({
    initializeLottery: init([LotteryPayload], (payload) => {
        // check lottery state, and fail if state is already initialized
        if (!('None' in lotteryState)){
            ic.trap(`Lottery already initilialized and is in ${lotteryState}`)
        }

        // check payload
        if (typeof payload !== "object" || Object.keys(payload).length === 0) {
            ic.trap("invalid payoad")
        }

        // set lottery config parameters
        lotteryState = Some(0);
        ticketPrice = Some(payload.ticketPrice);
        lotteryDuration = Some(payload.lotteryDuration);
    }),

    startLottery: update([], Result(Lottery, Message), () => {
        // check lottery state, and fail if state is not initialized
        if ('None' in lotteryState){
            return Err({ ConfigError: "lottery not yet initialized"});
        }

        // only start lottery if state has been set to 0 i.e ended
        if (lotteryState.Some !== 0){
            return Err({ StateError: "cannot start new lottery, check lottery state"});
        }

        // get current lottery id
        let id : int32 = getCurrentLotteryId();

        // check if lottery duration is set
        if ('None' in lotteryDuration){
            return Err({ConfigError: "cannot start lottery, duration ont set"});
        }

        // create new lottery record
        const lottery = { 
            id: id as int32, 
            startTime: ic.time(), 
            endTime: ic.time() + lotteryDuration.Some, 
            noOfTickets: 0,
            winner: None,
            winningTicket: None,
            players: [],
            lotteryCompleted: 0
        };

        // store lottery
        lotteryStorage.insert(lottery.id, lottery);

        // update lottery state to 1 i.e. started
        lotteryState = Some(1);

        return Ok(lottery);
    }),

    createTicketOrder: update([BuyTicketPayload], Result(Order, Message), (payload) => {
        // check payload data
        if (typeof payload !== "object" || Object.keys(payload).length === 0) {
            return Err({ NotFound: "invalid payoad" })
        }

        // check lottery state, and fail if state is not initialized
        if ('None' in lotteryState){
            return Err({ ConfigError: "lottery not yet initialized"});
        }

        // only buy ticket if state has been set to 1 i.e started
        if (lotteryState.Some !== 1){
            return Err({ StateError: "cannot start buy ticket, check lottery state"});
        }

        // get ticket price and amount to pay
        if ('None' in ticketPrice) {
            return Err({ ConfigError: 'cannot buy tickets, price not set'})
        }

        // get lottery
        const lotteryOpt = lotteryStorage.get(payload.lotteryId);
        if ("None" in lotteryOpt) {
            return Err({ NotFound: `cannot create the order: lottery session with ${payload.lotteryId} not found` });
        }
        const lottery = lotteryOpt.Some;

        // check that lottery hasn't ended
        if (lotteryOpt.Some.endTime < ic.time()){
            return Err({StateError: "lottery over, can't buy tickets"})
        }

        // compute amount to be paid
        const amountToPay = BigInt(payload.noOfTickets) * ticketPrice.Some;

        // create order
        const order = {
            lotteryId: lottery.id,
            amount: amountToPay,
            status: { PaymentPending: "PAYMENT_PENDING" },
            buyer: ic.caller(),
            paid_at_block: None,
            memo: generateCorrelationId(lottery.id)
        };

        // store and return order
        pendingOrders.insert(order.memo, order);
        discardByTimeout(order.memo, ORDER_RESERVATION_PERIOD);
        return Ok(order);
    }),

    registerTickets: update([Principal, int32, int32, nat64, nat64, nat64], Result(Order, Message), async (seller, id, noOfTickets, amountPaid, block, memo) => {
        // check lottery state, and fail if state is not initialized
        if ('None' in lotteryState){
            return Err({ ConfigError: "lottery not yet initialized"});
        }
        
        // confirm payment verification else fail
        const paymentVerified = await verifyPaymentInternal(seller, amountPaid, block, memo);
        if (!paymentVerified) {
            return Err({ NotFound: `cannot complete the purchase: cannot verify the payment, memo=${memo}` });
        }

        // get pending order and update
        const pendingOrderOpt = pendingOrders.remove(memo);
        if ("None" in pendingOrderOpt) {
            return Err({ NotFound: `cannot complete the purchase: there is no pending order with id=${id}` });
        }
        const order = pendingOrderOpt.Some;
        const updatedOrder = { ...order, status: { Completed: "COMPLETED" }, paid_at_block: Some(block) };

        // get and update prizepool
        if ('None' in prizePool){
            prizePool = Some(amountPaid)
        }else{
            prizePool.Some += amountPaid;
        }

        // get lottery and add tickets
        const lotteryOpt = lotteryStorage.get(id);
        if ("None" in lotteryOpt) {
            return Err({ NotFound: `lottery session with id=${id} not found` });
        }

        const lottery = lotteryOpt.Some;

        // generate ticket numbers and assign tickets to their ticketIds
        const ticketNumbers = [];

        const caller = ic.caller();

        let oldTicketsCount = lottery.noOfTickets;
        
        let newTicketId = oldTicketsCount;
        
        while (newTicketId < (noOfTickets + oldTicketsCount)) {
            ticketNumbers.push(newTicketId);
            newTicketId += 1;
        }

        // generate lottery track identifier
        const idTrack = `#${id}#`;

        // check mapping to get player lottery participation unique id arrays
        let playerIdMap = playerIndexMap.get(caller);

        let playerInfos = lottery.players;

        // check if player's participation array is empty
        if ("None" in playerIdMap) {
            //if empty create new information for player
            let newId = `${uuidv4() + idTrack}`;
            let newPlayerPosn =  playerInfos.length + 1;

            // update player information with new unique id
            playerIdMap.Some.push(newId)
            playerIndexMap.insert(caller, playerIdMap);
            indexToPosnMap.insert(newId, newPlayerPosn)

            // get player info and add to lottery player array
            let playerInfo = generatePlayerInformation(id, caller, newPlayerPosn, ticketNumbers)
            playerInfos.push(playerInfo)
        }else{
            let playerPosn: int32;
            let uniqueId: string = "";

            // check if player already has uniqueId 
            for (let i of playerIdMap.Some){
                if(i.includes(`${idTrack}`)){
                    uniqueId = i;
                    break;
                }
            }

            // then get the player position
            let playerPosnOpt = indexToPosnMap.get(uniqueId);

            if('None' in playerPosnOpt) {
                playerPosn = 0
            }else {
                playerPosn = playerPosnOpt.Some;
            }

            // check if unique id not present or playerPosn is 0 i.e hasn't bought a ticket in this lottery session
            // but has bought a ticket in a previous lottery session
            if(uniqueId == "" && playerPosn == 0){
                // generate new id and update the player mapping informations
                let newId = `${uuidv4() + idTrack}`;
                let newPlayerPosn = playerInfos.length + 1;
                playerIdMap.Some.push(newId);
                playerIndexMap.insert(caller, playerIdMap);
                indexToPosnMap.insert(newId, newPlayerPosn)
                let playerInfo = generatePlayerInformation(id, caller, newPlayerPosn, ticketNumbers)
                playerInfos.push(playerInfo)
            }else{
                // else just add ticketNumbers to player tickets array
                let playerTickets = playerInfos[playerPosn - 1].tickets;
                playerInfos[playerPosn - 1].tickets = playerTickets.concat(ticketNumbers);
            }
        }

        // update record in storage
        const updatedLottery = {
            ...lottery, 
            noOfTickets: lottery.noOfTickets + noOfTickets,
            players: playerInfos
        }

        persistedOrders.insert(ic.caller(), updatedOrder);
        lotteryStorage.insert(id, updatedLottery);
        return Ok(updatedOrder);
    }),

    endLottery: update([QueryPayload], Result(text, Message), (payload) => {
        // check payload data
        if (typeof payload !== "object" || Object.keys(payload).length === 0) {
            return Err({ NotFound: "invalid payoad" })
        }

        // check lottery state, and fail if state is not initialized
        if ('None' in lotteryState){
            return Err({ ConfigError: "lottery not yet initialized"});
        }

        // only start lottery if state has been set to 0 i.e ended
        if (lotteryState.Some !== 1){
            return Err({ StateError: "cannot end lottery, check lottery state"});
        }

        const id = payload.lotteryId;

        // get lottery and add tickets
        const lotteryOpt = lotteryStorage.get(id);
        if ("None" in lotteryOpt) {
            return Err({ NotFound: `lottery session with id=${id} not found` });
        }

        const lottery = lotteryOpt.Some;

        // check that lottery has ended
        if (lotteryOpt.Some.endTime > ic.time()){
            return Err({StateError: "lottery not yet over"})
        }

        // check that the lottery has been completed
        if (lottery.Some.lotteryCompleted !== 0){
            return Err({StateError: "lottery already ended"})
        }

        // get random number as winning tickets
        let ticketsSold = lottery.noOfTickets;
        const randomValue = Math.random() * ticketsSold;
        let winningTicket = Math.floor(randomValue);

        // update record in storage and set lottery completed status to 1 i.e. waiting for payouts
        const updatedLottery = { 
            ...lottery,
            winningTicket: Some(winningTicket),
            lotteryCompleted: 1
        };

        // update records
        lotteryStorage.insert(lottery.id, updatedLottery);

        return Ok("lottery ended, winner can claim now.");
    }),

    checkIfWinner: update([QueryPayload], Result(text, Message), async (payload) => {
        // check payload data
        if (typeof payload !== "object" || Object.keys(payload).length === 0) {
            return Err({ NotFound: "invalid payoad" })
        }

        // check lottery state, and fail if state is not initialized
        if ('None' in lotteryState){
            return Err({ ConfigError: "lottery not yet initialized"});
        }

        // only start lottery if state has been set to 1 i.e payout
        if (lotteryState.Some !== 1){
            return Err({ StateError: "lottery not yet ended, check lottery state"});
        }

        // get caller
        const caller = ic.caller()

        // get and update prizepool
        if ('None' in prizePool){
            return Err({ ConfigError: "lottery pool is empty, please try again later."});
        }

        // calculate winners reward
        const winnersReward = prizePool.Some / 2n;

        prizePool.Some -= winnersReward;

        const id = payload.lotteryId;

        // get lottery and add tickets
        const lotteryOpt = lotteryStorage.get(id);
        if ("None" in lotteryOpt) {
            return Err({ NotFound: `lottery session with id=${id} not found` });
        }

        const lottery = lotteryOpt.Some;

        if(lottery.lotteryCompleted === 2){
            return Err({StateError: "winner already selected"})
        }

        let playerPosn: int32;
        let uniqueId: string = "";

        // generate lottery track identifier
        const idTrack = `#${id}#`;

        // check mapping to get player lottery participation unique id arrays
        let playerIdMap = playerIndexMap.get(caller);

        if('None' in playerIdMap){
            return Err({NotFound: "no lottery information"})
        }

        // check player unique id mapping for lottery id tracker
        for (let i of playerIdMap.Some){
            if(i.includes(`${idTrack}`)){
                uniqueId = i;
                break;
            }
        }

        // then get the player position
        let playerPosnOpt = indexToPosnMap.get(uniqueId);

        if('None' in playerPosnOpt) {
            playerPosn = 0
        }else {
            playerPosn = playerPosnOpt.Some;
        }

        // if no unique id is not present and playerPosn is 0, exit application with error,
        // shows that player did not participate in the lottery.
        if(uniqueId == "" && playerPosn == 0){
            return Err({NotFound: "no lottery information"})
        }

        // else continue and get player info
        const playerInfo = lottery.players[playerPosn - 1];

        // check if player tickets for that lottery contains the winning ticket
        if(playerInfo.tickets.includes(lottery.winningTicket)){
            // initiate payout to winner
            // send ticket payment to icp contract
            // await tokenCanister.transfer(lotteryCanister, caller.toString(), winnersReward).call();   
            await makePayment(playerInfo.player, winnersReward);

        }else{
            return Err({NotWinner: "sorry you're not winner"})
        }

        // update record in storage and set lottery completed status to payout completed
        const updatedLottery = { 
            ...lottery,
            winner: playerInfo.player,
            lotteryCompleted: 2,
        };

        lotteryStorage.insert(lottery.id, updatedLottery);

        return Ok("Congrats you're the winner check your balance")
    }),

    getOrders: query([], Vec(Order), () => {
        return persistedOrders.values();
    }),
   
    getPendingOrders: query([], Vec(Order), () => {
        return pendingOrders.values();
    }),
   
    getLottery: query([int32], Result(Lottery, Message), (id) => {
        const lotteryOpt = lotteryStorage.get(id);
        if ("None" in lotteryOpt) {
            return Err({ NotFound: `lottery session with id=${id} not found` });
        }
        return Ok(lotteryOpt.Some);
    }),
    

    getLotteries: query([], Vec(Lottery), () => {
        return lotteryStorage.values();
    }),

    getLotteryConfiguration: query([], LotteryConfiguration, () => {
        return {currlotteryId, lotteryState, ticketPrice, lotteryDuration, prizePool}
    }),
    //This function fetches and returns details about a specific lottery by its ID .
    
    query([int32], Result<Lottery, Message>, (id) => {
        const lottery = lotteryStorage.get(id);
        
        if ('None' in lottery) {
          return Err({ NotFound: `No lottery found with ID ${id}.` });
        }
        
        return Ok(lottery.Some);
    });
      

    deleteLottery: update([int32], Result(text, Message), (id) => {
        const deletedLotteryOpt = lotteryStorage.remove(id);
        if ("None" in deletedLotteryOpt) {
            return Err({ NotFound: `lottery session with id=${id} not found` });
        }

        if(deletedLotteryOpt.Some.lotteryCompleted !== 2) {
            return Err({StateError: 'lottery payout not yet finalized'})
        }

        return Ok(deletedLotteryOpt.Some.id);
    }),
    
})


///////////////////////////// HELPER FUNCTIONS ///////////////////////////////////////////

// to generate a new player information
function generatePlayerInformation(lotteryId: int32, caller: Principal, newPlayerId: int32, ticketNumbers: Vec<any>) {
    const newPlayer = {
            id: newPlayerId,
            lotteryId: lotteryId,
            player: caller,
            tickets: ticketNumbers
    }
    return newPlayer
}

// returns to the current lottery id
function getCurrentLotteryId() {
    if(currlotteryId.Some){
        return currlotteryId.Some + 1;
    }else {
        return 0
    }
}

// to process payment from this canister to winner.
async function makePayment(winner: Principal, amount: nat64) {
    const toAddress = hexAddressFromPrincipal(winner, 0);
    const transferFeeResponse = await ic.call(icpLedgerCanister.transfer_fee, { args: [{}] });
    const transferResult = ic.call(icpLedgerCanister.transfer, {
        args: [{
            memo: 0n,
            amount: {
                e8s: amount
            },
            fee: {
                e8s: transferFeeResponse.transfer_fee.e8s
            },
            from_subaccount: None,
            to: binaryAddressFromAddress(toAddress),
            created_at_time: None
        }]
    });
    if ("Err" in transferResult) {
        return Err({ PaymentFailed: `payment failed, err=${transferResult.Err}` })
    }
    return Ok({ PaymentCompleted: "payment completed" });
}

/*
    a hash function that is used to generate correlation ids for orders.
    also, we use that in the verifyPayment function where we check if the used has actually paid the order
*/
function hash(input: any): nat64 {
    return BigInt(Math.abs(hashCode().value(input)));
};

function generateCorrelationId(lotteryId: int32): nat64 {
    const correlationId = `${lotteryId}_${ic.caller().toText()}_${ic.time()}`;
    return hash(correlationId);
};


/*
    after the order is created, we give the `delay` amount of minutes to pay for the order.
    if it's not paid during this timeframe, the order is automatically removed from the pending orders.
*/
function discardByTimeout(memo: nat64, delay: Duration) {
    ic.setTimer(delay, () => {
        const order = pendingOrders.remove(memo);
        console.log(`Order discarded ${order}`);
    });
};

async function verifyPaymentInternal(receiver: Principal, amount: nat64, block: nat64, memo: nat64): Promise<bool> {
    const blockData = await ic.call(icpLedgerCanister.query_blocks, { args: [{ start: block, length: 1n }] });
    const tx = blockData.blocks.find((block) => {
        if ("None" in block.transaction.operation) {
            return false;
        }
        const operation = block.transaction.operation.Some;
        const senderAddress = binaryAddressFromPrincipal(ic.caller(), 0);
        const receiverAddress = binaryAddressFromPrincipal(receiver, 0);
        return block.transaction.memo === memo &&
            hash(senderAddress) === hash(operation.Transfer?.from) &&
            hash(receiverAddress) === hash(operation.Transfer?.to) &&
            amount === operation.Transfer?.amount.e8s;
    });
    return tx ? true : false;
};


// a workaround to make uuid package work with Azle
globalThis.crypto = {
    //@ts-ignore
    getRandomValues: () => {
        let array = new Uint8Array(32);

        for (let i = 0; i < array.length; i++) {
            array[i] = Math.floor(Math.random() * 256);
        }

        return array;
    }
};
