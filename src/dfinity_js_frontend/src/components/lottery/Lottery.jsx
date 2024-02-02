import React, { useState, useEffect, useCallback } from "react";
import { toast } from "react-toastify";
import { Button } from "react-bootstrap";
import PrevRounds from "./PrevRounds";
import BuyTicketForm from "./BuyTicketForm";
import Loader from "../utils/Loader";
import { NotificationSuccess, NotificationError } from "../utils/Notifications";
import * as lottery from '../../utils/lottery'
import { dummyLottery  } from "../../utils/constants";

const Lottery = ({ address, fetchBalance }) => {
  const [loading, setLoading] = useState(false);
  const [lotteries, setLotteries] = useState([]);
  const [currentLottery, setCurrentLottery] = useState({});
  const [lotteryConfig, setLotteryConfig] = useState({});
  const [open, openModal] = useState(false);

  // function to get lotteries
  const getLotteries = useCallback(async () => {
    try{
      setLoading(true);
      const lotteries = await lottery.getLotteries();
      if (lotteries.length > 0) {
        setLotteries(lotteries);
        // get last lottery in array and set to current lottery
        let length = lotteries.length;
        if (length > 0) {
          let currentLottery = lotteries[lotteries.length - 1];
          setCurrentLottery(currentLottery);
        }
      } else {
        let lottery = [];
        lottery.push(dummyLottery);
        setLotteries(lottery);
        setCurrentLottery(dummyLottery);
      }
    }catch (error){
      console.log({ error });
      toast(<NotificationError text="Error in getting lotteries." />);
    } finally{
      setLoading(false)
    }
  }, []);

  // function to get the list of products
  const getLotteryConfig = useCallback(async () => {
    try {
      setLoading(true);
      setLotteryConfig(await lottery.getLotteryConfiguration());
    } catch (error) {
      console.log({ error });
      toast(<NotificationError text="Error in getting lottery config." />);
    } finally {
      setLoading(false);
    }
  });

  //  function to start Lottery
  const startLottery = async () => {
    try{
      setLoading(true);
      await lottery.startLottery().then((resp) => {
        getLotteries();
         // add fetch balance here
      });
      toast(<NotificationSuccess text="New lottery session started successfully." />);
    } catch(error) {
      console.log({ error });
      toast(<NotificationError text="Failed to start new lottery session." />);
    } finally {
      setLoading(false);
    }
  };

  //  function to buy ticket
  const buyTicket = async (lotteryId, noOfTickets) => {
    try{
      setLoading(true);
      await lottery.buyTickets({lotteryId, noOfTickets}).then((resp) => {
        getLotteries();
        // add fetch balance here
      });
      toast(<NotificationSuccess text="Tickets bought successfully." />);
    } catch(error) {
      console.log({ error });
      toast(<NotificationError text="Failed to buy tickets." />);
    } finally {
      setLoading(false);
    }
  };

  //  function to end Lottery
  const endLottery = async (id) => {
    try{
      setLoading(true);
      await lottery.endLottery(id).then((resp) => {
        getLotteries();
        // add fetch balance here
      });
      toast(<NotificationSuccess text="Lottery session ended successfully." />);
    } catch(error) {
      console.log({ error });
      toast(<NotificationError text="Failed to end Lottery" />);
    } finally {
      setLoading(false);
    }
  };

  //  function to join Lottery
  const checkIfWinner = async (id) => {
    try{
      setLoading(true);
      await lottery.checkIfWinner(id).then((resp) => {
        getLotteries();
        // add fetch balance here
      });
      toast(<NotificationSuccess text="Check completed" />);
    } catch(error) {
      console.log({ error });
      toast(<NotificationError text="Check failed" />);
    } finally {
      setLoading(false);
    }
  };

  const lotteryEnded = () => {
    let now = new Date();
    let lotteryEndTime = new Date(currentLottery.endTime * 1000);
    return now >= lotteryEndTime;
  };

  const checkLotteryState = (num) => lotteryConfig.lotteryState === num;

  const checkLotteryCompleted = (num) => currentLottery.lotteryCompleted === num;

  // handle Actions of the button
  const handleActions = async () => {
    if (checkLotteryState(0)) {
      // start lottery when lottery status is 0 and lottery duration is more than 0
      startLottery();
    } else if (checkLotteryState(1) && !lotteryEnded()) {
      // check that lottery state is set to started and lottery has not end
      // then open buy tickets modal
      openModal(true);
    } else if (checkLotteryState(1) && lotteryEnded()) {
      // check that lottery state is set to started and lottery has ended
      // then end lottery
      endLottery(currentLottery.id);
    }
  };

  // handle message on button
  // same checks as the handle action
  const handleMessage = () => {
    if (checkLotteryState(0)) {
      return "Start Lottery";
    } else if (checkLotteryState(1) && !lotteryEnded()) {
        return "Buy Tickets";
    } else if (checkLotteryState(1) && lotteryEnded()) {
        return "End Lottery";
    }
  };

  const principal = window.auth.principalText;

  useEffect(() => {
    getLotteries();
    getLotteryConfig();
  }, [getLotteries, getLotteryConfig]);

  return (
    <>
      {!loading ? (
        <>
          <div className="container">
            <div className="tabs-container header">
              {currentLottery.status !== 0 ? (
                <div className="tab">Current Lottery</div>
              ) : (
                <div className="tab">Lottery DApp will be starting soon..</div>
              )}
            </div>

            <div className="lottery-container">
              <div className="lottery-header">
                <div>
                  <p>
                    <strong>ID: </strong>{" "}
                    <span className="round-num">{currentLottery.id}</span>
                  </p>
                  <p>
                    <strong>Status: </strong>{" "}
                    {/* {lottery.checkStatus(
                      currentLottery.status,
                      currentLottery.lottery_end_time
                    )} */}
                  </p>
                  <p>
                    <strong>
                      {checkLotteryState(0)
                        ? "Lottery Duration: Not started"
                        : checkLotteryCompleted(0)
                        ? "Lottery Ends: "
                        : "Lottery Ended: "}
                    </strong>{" "}
                    {/* {checkLotteryState(0)
                      ? `${lotteryConfig.lotteryDuration / 60} Mins`
                      : convertTime(currentLottery.lo)} */}
                  </p>
                  {lotteryEnded() && checkLotteryCompleted(1) && (
                    <div className="winner">
                      <p>
                        <strong>Winner: </strong>
                        {currentLottery.winner? 
                          currentLottery.winner === principal? 
                            "Congratulations you won" :  "Sorry you lost, try again" 
                          : 
                            "Check if you're the winner" 
                        }
                        {(currentLottery.winner && currentLottery.winner !== principal) && (
                          <a
                            href={`https://testnet.algoexplorer.io/address/${currentLottery.winner}`}
                            target="_blank"
                            rel="noreferrer"
                          >
                            View Winner
                          </a>
                        )}
                      </p>
                      { !currentLottery.winner  && (
                        <div className="button-body">
                          {" "}
                          <Button
                            variant="success"
                            className="check-if-winner right"
                            onClick={() => checkIfWinner(currentLottery)}
                          >
                            Check
                          </Button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
              <div className="lottery-body">
                <p>
                  <strong>Price Per Ticket: </strong>{" "}
                  {lotteryConfig.ticketPrice
                    ? (lotteryConfig.ticketPrice / BigInt(10**8)).toString()
                    : 0}{" "}
                  ICP
                </p>
                <p>
                  <strong>No Of tickets Sold: </strong>
                  {currentLottery.noOfTickets}
                </p>
                <p>
                  <strong>Participants: </strong>
                  {currentLottery.players.length}
                </p>
                <p>
                  <strong>Prize: </strong>{" "}
                  {currentLottery.winner_reward
                    ? (currentLottery.reward / BigInt(10**8)).toString()
                    : lotteryConfig.prizePool
                    ? (lotteryConfig.prizePool / BigInt(10**8)).toString()
                    : 0}{" "}
                  ICP
                </p>
                <p>
                  <strong>Your Tickets: </strong>
                  {/* {currentLottery.user_no_of_tickets} */}
                </p>
              </div>
              <div className="lottery-footer">
                <Button
                  variant="success"
                  className="buy-lottery-btn"
                  onClick={() => handleActions()}
                >
                  {handleMessage()}
                </Button>
              </div>
            </div>
          </div>

          {lotteries.length > 1 && (
            <PrevRounds Lotteries={lotteries} checkIfWinner={checkIfWinner} />
          )}
        </>
      ) : (
        <Loader />
      )}

      {open && (
        <BuyTicketForm
          lottery={currentLottery}
          open={open}
          onClose={() => openModal(false)}
          buyTicket={buyTicket}
        />
      )}
    </>
  );
};

export default Lottery;
