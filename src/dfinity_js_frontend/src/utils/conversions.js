export const convertTime = (nanosecs) => {
    if (nanosecs === 0) {
      return "--";
    }
  
    let dateObj = new Date(nanosecs / 1000000);
  
    let date = dateObj.toLocaleDateString("en-us", {
      weekday: "short",
      year: "numeric",
      month: "short",
      day: "numeric",
    });
    let time = dateObj.toLocaleString("en-us", {
      hour: "numeric",
      minute: "numeric",
      hour12: true,
    });
    return date + ", " + time;
};

export const truncateAddress = (address) => {
    if (!address) return;
    return (
      address.slice(0, 5) +
      "..." +
      address.slice(address.length - 5, address.length)
    );
  };
  
  
  