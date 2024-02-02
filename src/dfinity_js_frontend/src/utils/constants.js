
/// values for dummy contract
let id = 0;
let startTime = 0;
let endTime = 0;
let noOfTickets = 0;
let winner = null;
let winningTicket = null;
let reward = null;
let players = [];
let lotteryCompleted = 0;

let currlotteryId = 0;
let lotteryState = 0;
let ticketPrice = 0;
let lotteryDuration = 0;
let prizePool = 0;

export class Lottery {
    constructor(
        id,
        startTime,
        endTime,
        noOfTickets,
        winner,
        winningTicket,
        reward,
        players,
        lotteryCompleted
    ){
        this.id = id;
        this.startTime = startTime;
        this.endTime = endTime;
        this.noOfTickets = noOfTickets;
        this.winner = winner;
        this.reward = reward;
        this.winningTicket = winningTicket;
        this.players = players;
        this.lotteryCompleted = lotteryCompleted;
    }
}

export class LotteryConfig {
    constructor(
        currlotteryId,
        lotteryState,
        ticketPrice,
        lotteryDuration,
        prizePool
    ){
        this.currlotteryId = currlotteryId;
        this.lotteryState = lotteryState;
        this.ticketPrice = ticketPrice;
        this.lotteryDuration = lotteryDuration;
        this.prizePool = prizePool;
    }
}

export const dummyLottery = new Lottery(
    id,
    startTime,
    endTime,
    noOfTickets,
    winner,
    winningTicket,
    players,
    lotteryCompleted
);


export const initLotteryConfig = new LotteryConfig(
    currlotteryId,
    lotteryState,
    ticketPrice,
    lotteryDuration,
    prizePool
)