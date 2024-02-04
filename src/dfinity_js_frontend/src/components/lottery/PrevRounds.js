import React, { useState } from "react";
import Loader from "../utils/Loader";
import { Button } from "react-bootstrap";
import { convertTime } from "../../utils/conversions";

const PrevRounds = ({ Lotteries, checkIfWinner, lotteryConfig }) => {
  const principal = window.auth.principalText;
  
  const [loading, setLoading] = useState(false);

  const [position, setPosition] = useState(Lotteries.length - 2);

  const [lottery, setLottery] = useState(Lotteries[position]);


  const previousLottery = async (e) => {
    setLoading(true);
    e.preventDefault();
    let newPosition = position - 1;
    if (newPosition < 0) {
      setLoading(false);
      return;
    }
    setLottery(Lotteries[newPosition]);
    setPosition(newPosition);
    setLoading(false);
  };

  const nextLottery = async (e) => {
    setLoading(true);
    e.preventDefault();
    let newPosition = position + 1;
    if (newPosition >= Lotteries.length - 1) {
      setLoading(false);
      return;
    }
    setLottery(Lotteries[newPosition]);
    setPosition(newPosition);
    setLoading(false);
  };

  return (
    <>
      <div className="container">
        <div className="tabs-container header">
          <div className="tab">Lottery History</div>
        </div>
        <div className="lottery-container">
          {!loading ? (
            <>
              <div className="lottery-header">
                <div className="round-details">
                  <p>
                    <strong>ID: </strong>{" "}
                    <span className="round-num">{lottery.id}</span>
                  </p>
                  <div className="rounds-nav">
                    <a href="/#" onClick={previousLottery} className="prev">
                      &#8592;
                    </a>
                    <a href="/#" onClick={nextLottery} className="next">
                      &#8594;
                    </a>
                  </div>
                </div>
                <p>
                  <strong>Drawn: </strong>{" "}
                  {convertTime(lottery.endTime)}
                </p>
                <p>
                  <strong>Winner: </strong>
                  {lottery.winner? 
                    lottery.winner === principal? 
                      "Congratulations you won" :  "Sorry you lost, try again" 
                    : 
                      "Check if you're the winner" 
                  }
                  {(lottery.winner.length > 0 && lottery.winner[0] !== principal) && (
                    <a
                      href={`https://testnet.algoexplorer.io/address/${lottery.winner[0]}`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      View Winner
                    </a>
                  )}
                </p>
              </div>
              <div className="lottery-body">
                <p>
                  <strong>Price Per Ticket: </strong>{" "}
                  {lotteryConfig.ticketPrice.length > 0
                    ? (lotteryConfig.ticketPrice[0] / BigInt(10**8)).toString()
                    : 0}{" "}
                  ICP
                </p>
                <p>
                  <strong>No of Tickets Sold: </strong>{" "}
                  {lottery.noOfTickets}
                </p>
                <p>
                  <strong>Participants: </strong>
                  {lottery.players.length}
                </p>
                <p>
                  <strong>Prize: </strong>{" "}
                  {(lottery.reward[0] / BigInt(10**8)).toString()} ICP
                </p>
                <p>
                  <strong>Your Tickets: </strong>
                  {/* {lottery.user_no_of_tickets} */}
                </p>
              </div>
              <div className="lottery-footer">
                {!lottery.winner && (
                  <Button
                    variant="success"
                    className="check-if-winner"
                    onClick={() => checkIfWinner(lottery.id)}
                  >
                    Check if you won
                  </Button>
                )}
              </div>
            </>
          ) : (
            <Loader />
          )}
        </div>
      </div>
    </>
  );
};

export default PrevRounds;
