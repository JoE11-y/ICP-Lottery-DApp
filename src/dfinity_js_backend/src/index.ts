import { StableBTreeMap, Principal, nat64, ic, Opt, int8, int32, Vec, text, None, Canister, init, query, Some, update, Result, Err, Ok, Duration, bool } from 'azle';
import { Ledger, binaryAddressFromAddress, hexAddressFromPrincipal } from "azle/canisters/ledger";
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
let currlotteryId: Opt<int32> = None;
let lotteryState: Opt<int8> = None;
let ticketPrice: Opt<nat64> = None;
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
        if (!('None' in lotteryState)) {
            ic.trap(`Lottery already initialized and is in state ${lotteryState}`);
        }

        // check payload
        if (typeof payload !== "object" || Object.keys(payload).length === 0) {
            ic.trap("Invalid payload");
        }

        // set lottery config parameters
        lotteryState = Some(0);
        ticketPrice = Some(payload.ticketPrice);
        lotteryDuration = Some(payload.lotteryDuration);
    }),

    startLottery: update([], Result(Lottery, Message), () => {
        // check lottery state, and fail if state is not initialized
        if ('None' in lotteryState) {
            return Err({ ConfigError: "Lottery not yet initialized" });
        }

        // only start lottery if state has been set to 0 i.e ended
        if (lotteryState.Some !== 0) {
            return Err({ StateError: "Cannot start new lottery, check lottery state" });
        }

        // get current lottery id
        let id: int32 = getCurrentLotteryId();

        // check if lottery duration is set
        if ('None' in lotteryDuration) {
            return Err({ ConfigError: "Cannot start lottery, duration not set" });
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
            lotteryCompleted: 0,
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
            return Err({ NotFound: "Invalid payload" })
        }

        // check lottery state, and fail if state is not initialized
        if ('None' in lotteryState) {
            return Err({ ConfigError: "Lottery not yet initialized" });
        }

        // only buy ticket if state has been set to 1 i.e started
        if (lotteryState.Some !== 1) {
            return Err({ StateError: "Cannot start buy ticket, check lottery state" });
        }

        // get ticket price and amount to pay
        if ('None' in ticketPrice) {
            return Err({ ConfigError: 'Cannot buy tickets, price not set' })
        }

        // get lottery
        const lotteryOpt = lotteryStorage.get(payload.lotteryId);
        if ("None" in lotteryOpt) {
            return Err({ NotFound: `Cannot create the order: lottery session with ${payload.lotteryId} not found` });
        }
        const lottery = lotteryOpt.Some;

        // check that lottery hasn't ended
        if (lotteryOpt.Some.endTime < ic.time()) {
            return Err({ StateError: "Lottery over, can't buy tickets" })
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
            memo: generateCorrelationId(lottery.id),
        };

        // store and return order
        pendingOrders.insert(order.memo, order);
        discardByTimeout(order.memo, ORDER_RESERVATION_PERIOD);
        return Ok(order);
    }),

    registerTickets: update([Principal, int32, int32, nat64, nat64, nat64], Result(Order, Message), async (seller, id, noOfTickets, amountPaid, block, memo) => {
        // check lottery state, and fail if state is not initialized
        if ('None' in lotteryState) {
            return Err({ ConfigError: "Lottery not yet initialized" });
        }

        // confirm payment verification else fail
        const paymentVerified = await verifyPaymentInternal(ic.caller(), amountPaid, block, memo);
        if (!paymentVerified) {
            return Err({ PaymentError: "Payment verification failed" });
        }

        // get order
        const orderOpt = pendingOrders.get(memo);
        if ("None" in orderOpt) {
            return Err({ NotFound: "Order not found" });
        }
        const order = orderOpt.Some;

        // check order status
        if ("OrderCompleted" in order.status || "OrderFailed" in order.status) {
            return Err({ OrderError: `Invalid order status: ${order.status}` });
        }

        // get lottery
        const lotteryOpt = lotteryStorage.get(order.lotteryId);
        if ("None" in lotteryOpt) {
            return Err({ NotFound: "Lottery not found" });
        }
        const lottery = lotteryOpt.Some;

        // register tickets
        const newPlayerId = lottery.noOfTickets;
        const ticketNumbers: Vec<nat64> = Vec();
        for (let i = 0; i < noOfTickets; i++) {
            const ticketNumber = BigInt(newPlayerId) + BigInt(i) + 1n;
            ticketNumbers.push(ticketNumber);
        }

        // create player information
        const playerInformation = generatePlayerInformation(order.lotteryId, ic.caller(), newPlayerId, ticketNumbers);

        // add player information to lottery
        lottery.players.push(playerInformation);

        // update lottery ticket count
        lottery.noOfTickets += noOfTickets;

        // add player index mapping
        playerIndexMap.insert(ic.caller(), playerInformation.tickets);

        // add index to position mapping
        indexToPosnMap.insert(uuidv4(), lottery.players.length - 1);

        // set player lottery position and update order status
        order.status = { OrderCompleted: "ORDER_COMPLETED" };
        persistedOrders.insert(ic.caller(), order);

        // check if lottery is complete
        if (lottery.noOfTickets === lottery.lotteryCompleted) {
            // lottery is complete, process winner
            const winner = selectWinner(lottery);
            const paymentResult = await makePayment(winner.player, prizePool.Some);
            if ("Err" in paymentResult) {
                return Err({ PaymentError: `Error making payment: ${paymentResult.Err}` });
            }
        }

        // remove pending order
        pendingOrders.remove(memo);

        return Ok(order);
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

    // Generate a new player information
    function generatePlayerInformation(lotteryId: int32, caller: Principal, newPlayerId: int32, ticketNumbers: Vec(nat64)): Player {
        return {
            id: newPlayerId,
            lotteryId: lotteryId,
            player: caller,
            tickets: ticketNumbers,
        };
    },

    // Returns the current lottery id
    function getCurrentLotteryId(): int32 {
        return currlotteryId.Some ? currlotteryId.Some + 1 : 0;
    },

    // Process payment from this canister to winner
    async function makePayment(winner: Principal, amount: nat64): Result(text, Message) {
        const toAddress = hexAddressFromPrincipal(winner, 0);
        const transferFeeResponse = await ic.call(icpLedgerCanister.transfer_fee, { args: [{}] });
        const transferResult = ic.call(icpLedgerCanister.transfer, {
            args: [{
                memo: 0n,
                amount: { e8s: amount },
                fee: { e8s: transferFeeResponse.transfer_fee.e8s },
                from_subaccount: None,
                to: binaryAddressFromAddress(toAddress),
                created_at_time: None,
            }],
        });
        if ("Err" in transferResult) {
            return Err({ PaymentFailed: `Payment failed, error=${transferResult.Err}` });
        }
        return Ok({ PaymentCompleted: "Payment completed" });
    },

    // Hash function for generating correlation ids for orders
    function hash(input: any): nat64 {
        return BigInt(Math.abs(hashCode().value(input)));
    },

    // Generate correlation id for orders
    function generateCorrelationId(lotteryId: int32): nat64 {
        const correlationId = `${lotteryId}_${ic.caller().toText()}_${ic.time()}`;
        return hash(correlationId);
    },

    // Discard orders by timeout
    function discardByTimeout(memo: nat64, delay: Duration): void {
        ic.setTimer(delay, () => {
            const order = pendingOrders.remove(memo);
            console.log(`Order discarded ${order}`);
        });
    },

    // Verify payment internally
    async function verifyPaymentInternal(receiver: Principal, amount: nat64, block: nat64, memo: nat64): Promise<bool> {
        const blockData = await ic.call(icpLedgerCanister.query_blocks, { args: [{ start: block, length: 1n }] });
        const tx = blockData.blocks.find((block) => {
            // Check transaction details
            return block.transaction.memo === memo &&
              hash(senderAddress) === hash(operation.Transfer?.from) &&
            hash(receiverAddress) === hash(operation.Transfer?.to) &&
            amount === operation.Transfer?.amount.e8s;
                true;
        });
        return tx ? true : false;
    },
});

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
