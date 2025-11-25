QT CW Tester v2.0
--------------------
QT CW Tester is a Node.js script to perform a simple verification of an Operator's common wallet. All CW API methods will be tested, along with various error cases. The testing is not comprehensive - this script is intended to be a tool to aid in the initial verification of a QT CW wallet implementation.

The script is designed to run on Mac OS X, Linux, or Windows systems with Node.js installed.


Requirements:
Node.js version: 14.0.0 or higher
Modules: axios, decimal.js

Files contained in the package:
  cw_qtcw_tester.js - The main script
  cw_qtcw_tester.cfg - Configuration for the script
  qtcw.js - Helper functions for the CW communication
  utils.js - General helper functions
  package.json - Node.js package configuration
  README.txt - Help file

Usage:

- First, install the required Node.js dependencies:
  npm install

- Then, modify the cw_qtcw_tester.cfg file and fill in the following
  walleturl - Operator's common wallet base url
  walletsession - The Operator generated player session token
  passkey - The shared secret pass-key.
  playerid - valid Operator's player id
  currency - The currency of the player wallet, as a 3-letter code according to ISO 4217.
  gameid - QT Platform game id.
  device - The device type of the player. Valid values are MOBILE or DESKTOP.
  clienttype - The client type of the game. Valid values are FLASH or HTML5.
  category - The category of the game, expressed as a path.
  completed - Determines whether the game round is finished. true or false
  amount - The amount used in different scenarios
  blockedplayerid - The player id to replicate account blocked error scenario. Leave this value as empty if scenario is not supported
  amounttoreachinsufficientfund - The amount to replicate the insufficient funds scenario in debit
  rewardurl - callback url related to wins outside the regular games.

- Then, run cw_qtcw_tester.js with one of the following arguments:
  node cw_qtcw_tester.js commonwallet - Performs success scenarios for verifysession, getbalance, withdrawal, rollback, deposit and reward
  node cw_qtcw_tester.js verifysession - Performs verify session
  node cw_qtcw_tester.js getbalance - Performs GetBalance
  node cw_qtcw_tester.js withdrawal - Performs Withdrawal
  node cw_qtcw_tester.js deposit - Performs deposit
  node cw_qtcw_tester.js rollback - Performs rollback
  node cw_qtcw_tester.js reward - Performs reward
  node cw_qtcw_tester.js idempotency - Test for idempotency request on Withdrawal, Deposit, Rollback and Reward endpoints
  node cw_qtcw_tester.js errors - Tests multiple error cases to verify the returned error codes
  node cw_qtcw_tester.js future - Test for future api compatibility. Withdrawal, Deposit, Rollback, Reward endpoints should allow parameters that may be introduced in the future
  node cw_qtcw_tester.js all - Will trigger getbalance, common wallet, idempotency errors and future

Example:
    node cw_qtcw_tester.js all

A successful test run will yield the following result:
2016-03-14 18:31:09.663420	Test successful! Common Wallet Tester completed in 0 seconds

If a critical error is detected, the test will halt after an error message.

If an scenario is does not passed the testing, it will immediately stop the testing process then display an error message, like
2016-03-15 10:39:17.613701	ERROR: Expected error is but actual is no error

Debugging:
   To see the http exchanges - request and response, define an environment variable: CW_DEBUG
   Example:
     CW_DEBUG=1 node cw_qtcw_tester.js all
