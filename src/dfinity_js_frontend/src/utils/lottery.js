import { transferICP } from "./ledger";

export async function startLottery(){
    return window.canister.lottery.startLottery()
}

export async function getLotteries(){
    try {
        return await window.canister.lottery.getLotteries();
    } catch (err) {
        if (err.name === "AgentHTTPResponseError") {
            const authClient = window.auth.client;
            await authClient.logout();
          }
          return [];
    }
}

export async function getLotteryConfiguration() {
    try{
        return await window.canister.lottery.getLotteryConfiguration();
    } catch (err) {
        if (err.name === "AgentHTTPResponseError") {
            const authClient = window.auth.client;
            await authClient.logout();
        }
        return {};
    }
}

export async function buyTickets(ticketPayload) {
    const lotteryCanister = window.canister.lottery;
    const orderResponse = await lotteryCanister.createTicketOrder(ticketPayload);
    if(orderResponse.Err){
        throw new Error(orderResponse.Err);
    }
    const canisterAddress = await lotteryCanister.getCanisterAddress();
    const block = await transferICP(canisterAddress, orderResponse.Ok.amount, orderResponse.Ok.memo);
    await lotteryCanister.registerTickets(
        ticketPayload.lotteryId, 
        ticketPayload.noOfTickets, 
        orderResponse.Ok.amount, 
        block, 
        orderResponse.Ok.memo
    );

}

export async function endLottery(id){
    return window.canister.lottery.endLottery(id);
}


export async function checkIfWinner(id){
    return window.canister.lottery.checkIfWinner(id);
}