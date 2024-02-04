# ICP-Lottery-DApp

Simple lottery caninster built on the ICP network.

- It allows any player to be able to start the lottery, buy tickets and even end the lottery.
- Players can then check to see if they're the lucky winners of that lottery.
- Winner gets half of the prizepool.

## How to deploy canisters

- Start the Local Internet Computer

    ```bash
    dfx start --background --clean
    ```

- Deploy the Ledger Canister

    ```bash
    npm run deploy:ledger
    ```

- Deploy the Internet Identity Canister

    ```bash
    dfx deploy internet_identity
    ```

- Deploy the Lottery Backend Canister

    ```bash
    # ticket price is entered in e8s
    # lottery duration is entered in minutes for testing purposes
    
    dfx deploy dfinity_js_backend --argument '(record {ticketPrice = 100000000; lotteryDuration = 10})'
    ```

- Deploy the Frontend Canister

    ```bash
    dfx deploy dfinity_js_frontend
    ```

## Funding Wallet

This next step shows how to fund your wallet with the tokens from the newly deployed Ledger canister.

- Copy your wallet ledger identifier from the frontend of lottery.
- Run the faucet script

    ```bash
    # npm run get:tokens <wallet identifier>
    npm run get:tokens 123525952y5y2835y235788238527358235823857
    ```
