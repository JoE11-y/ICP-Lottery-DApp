import {
    nat64,
    Record,
    int32,
    Principal,
    Vec,
    Opt,
    int8,
    text,
    Variant
} from 'azle';

export const Player = Record({
    id: int32,
    lotteryId: int32,
    player: Principal,
    tickets: Vec(int32),
})

export const Lottery = Record({
    id: int32,
    startTime: nat64,
    endTime: nat64,
    noOfTickets: int32,
    winner: Opt(Principal),
    winningTicket: Opt(int32),
    players: Vec(Player),
    lotteryCompleted: int32,
})

export const OrderStatus = Variant({
    PaymentPending: text,
    Completed: text
});

export const Order = Record({
    lotteryId: text,
    amount: nat64,
    status: OrderStatus,
    buyer: Principal,
    paid_at_block: Opt(nat64),
    memo: nat64
});

export const Message = Variant({
    ConfigError: text,
    StateError: text,
    NotFound: text,
    PaymentFailed: text,
    PaymentCompleted: text,
    NotWinner: text
});

export const LotteryConfiguration = Record({
    currlotteryId : Opt(int32),
    lotteryState : Opt(int8),
    ticketPrice : Opt(nat64),
    lotteryDuration: Opt(nat64),
    prizePool: Opt(nat64),
})

export const LotteryPayload = Record({
    ticketPrice: nat64,
    lotteryDuration: nat64,
})

export const BuyTicketPayload = Record({
    lotteryId: int32,
    noOfTickets: int32,
})

export const QueryPayload = Record({
    lotteryId: int32,
})

export const AddressPayload = Record({
    address: text
})

