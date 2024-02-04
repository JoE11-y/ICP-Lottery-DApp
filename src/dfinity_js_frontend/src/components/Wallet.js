import React from "react";
import { Dropdown, Stack } from "react-bootstrap";
import { truncateAddress } from "../utils/conversions";

const Wallet = ({ principal, dfxAddress, balance, symbol, isAuthenticated, destroy }) => {
  if (isAuthenticated) {
    return (
      <>
        <Dropdown>
          <Dropdown.Toggle
            variant="light"
            align="end"
            id="dropdown-basic"
            className="d-flex align-items-center border rounded-pill py-1"
          >
            {balance} <span className="ms-1"> {symbol}</span>
          </Dropdown.Toggle>

          <Dropdown.Menu className="shadow-lg border-0">
            <Dropdown.Item>
              <Stack direction="horizontal" gap={2}>
                Principal:
                <span className="font-monospace">{truncateAddress(principal)}</span>
              </Stack>
            </Dropdown.Item>

            <Dropdown.Item>
              <Stack direction="horizontal" gap={2}>
                DFx Address
                <span className="font-monospace">{truncateAddress(dfxAddress)}</span>
              </Stack>
            </Dropdown.Item>

            <Dropdown.Divider />

            <Dropdown.Item
              as="button"
              className="d-flex align-items-center"
              onClick={() => {
                destroy();
              }}
            >
              <i className="bi bi-box-arrow-right me-2 fs-4" />
              Logout
            </Dropdown.Item>
          </Dropdown.Menu>
        </Dropdown>
      </>
    );
  }

  return null;
};

export default Wallet;
