#!/usr/bin/env node

const { QTCW, convertToDecimal, verifyequalbalancereferenceid } = require('./qtcw');
const { log, error, randomstr } = require('./utils');
const Decimal = require('decimal.js');

function getBalance(jsonResponseBalance) {
  const balance = jsonResponseBalance.balance;
  return new Decimal(String(balance));
}

async function verifysession(qtcw) {
  log('Note: testing VerifySession to return the player\'s currency and balance');
  await qtcw.success_verifysession();
}

async function getbalance(qtcw) {
  log('Note: testing GetBalance to return the player\'s currency and balance');
  await qtcw.success_getbalance();
  await qtcw.success_getbalance_without_session();
  await qtcw.success_getbalance_expired_session();
}

async function withdrawal(qtcw, futureCompatible = 0) {
  log('Note: performing withdrawal against the wallet platform');
  const amount = qtcw.config.amount;
  await qtcw.success_withdrawal(amount, randomstr(), randomstr(), randomstr(), futureCompatible);
}

async function deposit(qtcw, futureCompatible = 0, shouldLog = true) {
  log('Note: performing deposit against the wallet platform');
  const amount = qtcw.config.amount;
  const roundid = randomstr();
  const txnId = randomstr();
  const clientRoundId = randomstr();
  await qtcw.success_withdrawal(amount, txnId, roundid, clientRoundId, futureCompatible);
  const currentBalance = await qtcw.getBalance();

  if (shouldLog) {
    log('\n\nNote: Performing tests with valid Wallet-Session Header');
  }
  const originalBalance = await qtcw.getBalance();
  const jsonresponse = await qtcw.success_deposit(amount, randomstr(), roundid, txnId, clientRoundId, futureCompatible);
  const balanceAfterTxn = getBalance(jsonresponse);
  await verifyBalanceCredit(qtcw, originalBalance, balanceAfterTxn, amount, 1);

  console.log('');
  if (shouldLog) {
    log('Testing Deposit Expired Wallet Session');
  }
  const roundid2 = randomstr();
  const txnId2 = randomstr();
  const betid = randomstr();
  const clientRoundId2 = randomstr();

  await qtcw.success_withdrawal(amount, betid, roundid2, clientRoundId2);
  const originalBalance2 = await qtcw.getBalance();
  const jsonresponse2 = await qtcw.success_deposit_expiredSession(roundid2, txnId2, betid, clientRoundId2, amount);
  const balanceAfterTxn2 = getBalance(jsonresponse2);
  await verifyBalanceCredit(qtcw, originalBalance2, balanceAfterTxn2, amount);

  await deposit_zero_balance(qtcw);
}

async function rollback(qtcw, futureCompatible = 0) {
  log('Note: performing rollback against the wallet platform');
  const jsonResponseBalance = await qtcw.success_getbalance();
  const currentBalance = jsonResponseBalance.balance;

  const amount = parseInt(qtcw.config.amount);
  const roundid = randomstr();
  const clientRoundId = randomstr();
  const jsonresponse = await qtcw.success_withdrawal(amount, randomstr(), roundid, randomstr());
  const referenceid = jsonresponse.referenceId;
  const jsonresponse2 = await qtcw.success_rollback(referenceid, amount, randomstr(), roundid, randomstr(), futureCompatible);
  const currentBalance2 = await verifyBalanceCredit(qtcw, convertToDecimal(currentBalance), getBalance(jsonresponse2), amount);
  return jsonresponse2;
}

async function rollback_v2(qtcw, futureCompatible = 0) {
  log('\n\nNote: performing rollback with valid wallet-session header');
  return await rollback_v2_internal(qtcw, futureCompatible, qtcw.config.walletsession);
}

async function rollback_v2_internal(qtcw, futureCompatible = 0, walletsession = null) {
  const originalBalance = getBalance(await qtcw.success_getbalance(false));
  const amount = parseInt(qtcw.config.amount);
  const roundid = randomstr();
  const clientRoundId = randomstr();
  const betIdForRollback = randomstr();
  await qtcw.success_withdrawal(amount, betIdForRollback, roundid, clientRoundId);
  const jsonresponse = await qtcw.success_rollback_v2(betIdForRollback, amount, randomstr(), roundid, clientRoundId, futureCompatible, walletsession);
  const balanceAfterTxn = getBalance(jsonresponse);
  const currentBalance = await verifyBalanceCredit(qtcw, originalBalance, balanceAfterTxn, new Decimal(String(0)));

  console.log('');
  log('Performing rollback with expired wallet session');
  const originalBalance2 = getBalance(await qtcw.success_getbalance(false));
  const roundid2 = randomstr();
  const clientRoundId2 = randomstr();
  const betIdForRollback2 = randomstr();
  await qtcw.success_withdrawal(amount, betIdForRollback2, roundid2, clientRoundId2);
  const jsonresponse2 = await qtcw.success_rollback_v2_expired_session(betIdForRollback2, amount, randomstr(), roundid2, clientRoundId2, futureCompatible, walletsession);
  const balanceAfterTxn2 = getBalance(jsonresponse2);
  await verifyBalanceCredit(qtcw, originalBalance2, balanceAfterTxn2, new Decimal(String(0)));

  return jsonresponse;
}

async function reward(qtcw, futureCompatible = 0) {
  log('Note: performing reward against the wallet platform');
  const balanceBeforeTxn = await qtcw.getBalance();
  const amount = qtcw.config.amount;
  const txnId = randomstr();
  const jsonResponseReward = await qtcw.success_reward(amount, txnId, futureCompatible);
  const balanceAfterTxn = getBalance(jsonResponseReward);
  await verifyBalanceCredit(qtcw, balanceBeforeTxn, balanceAfterTxn, amount);
}

async function three_withdrawals_one_deposit(qtcw) {
  console.log('');
  console.log('3 Withdrawals then 1 Deposit');
  const roundid = randomstr();
  const clientRoundId = randomstr();
  const amount = parseFloat(0.1);
  const betid1 = randomstr();
  const betid2 = randomstr();
  const betid3 = randomstr();

  const jsonResponseBalance = await qtcw.success_getbalance();
  let originalBalance = getBalance(jsonResponseBalance);

  let jsonresponseWithdraw = await qtcw.success_withdrawal(amount, betid1, roundid, clientRoundId);
  let currentBalance = getBalance(jsonresponseWithdraw);
  originalBalance = await verifyBalanceDebit(qtcw, originalBalance, currentBalance, amount);

  jsonresponseWithdraw = await qtcw.success_withdrawal(amount, betid2, roundid, clientRoundId);
  currentBalance = getBalance(jsonresponseWithdraw);
  originalBalance = await verifyBalanceDebit(qtcw, originalBalance, currentBalance, amount);

  jsonresponseWithdraw = await qtcw.success_withdrawal(amount, betid3, roundid, clientRoundId);
  currentBalance = getBalance(jsonresponseWithdraw);
  originalBalance = await verifyBalanceDebit(qtcw, originalBalance, currentBalance, amount);

  console.log('');
  const jsonresponseDeposit = await qtcw.success_deposit(amount, randomstr(), roundid, betid3, clientRoundId, 1, 'true');
  const balanceAfterTxn = getBalance(jsonresponseDeposit);
  const currentBalance2 = await verifyBalanceCredit(qtcw, originalBalance, balanceAfterTxn, amount, 1);
}

async function three_withdrawals_three_deposits(qtcw) {
  console.log('');
  console.log('3 Withdrawals then 3 Deposits');
  const roundid = randomstr();
  const clientRoundId = randomstr();
  const amount = parseFloat(0.1);
  const betid1 = randomstr();
  const betid2 = randomstr();
  const betid3 = randomstr();

  const jsonResponseBalance = await qtcw.success_getbalance();
  let originalBalance = getBalance(jsonResponseBalance);

  let jsonresponseWithdraw = await qtcw.success_withdrawal(amount, betid1, roundid, clientRoundId);
  let currentBalance = getBalance(jsonresponseWithdraw);
  originalBalance = await verifyBalanceDebit(qtcw, originalBalance, currentBalance, amount);

  jsonresponseWithdraw = await qtcw.success_withdrawal(amount, betid2, roundid, clientRoundId);
  currentBalance = getBalance(jsonresponseWithdraw);
  originalBalance = await verifyBalanceDebit(qtcw, originalBalance, currentBalance, amount);

  jsonresponseWithdraw = await qtcw.success_withdrawal(amount, betid3, roundid, clientRoundId);
  currentBalance = getBalance(jsonresponseWithdraw);
  originalBalance = await verifyBalanceDebit(qtcw, originalBalance, currentBalance, amount);

  let jsonresponseDeposit = await qtcw.success_deposit(amount, randomstr(), roundid, betid1, clientRoundId, 1, 'false');
  let balanceAfterTxn = getBalance(jsonresponseDeposit);
  currentBalance = await verifyBalanceCredit(qtcw, originalBalance, balanceAfterTxn, amount);
  originalBalance = currentBalance;

  jsonresponseDeposit = await qtcw.success_deposit(amount, randomstr(), roundid, betid2, clientRoundId, 1, 'false');
  balanceAfterTxn = getBalance(jsonresponseDeposit);
  currentBalance = await verifyBalanceCredit(qtcw, originalBalance, balanceAfterTxn, amount);
  originalBalance = currentBalance;

  console.log('');
  jsonresponseDeposit = await qtcw.success_deposit(amount, randomstr(), roundid, betid3, clientRoundId, 1, 'true');
  balanceAfterTxn = getBalance(jsonresponseDeposit);
  currentBalance = await verifyBalanceCredit(qtcw, originalBalance, balanceAfterTxn, amount, 1);
}

async function one_withdrawal_three_deposits(qtcw) {
  console.log('');
  console.log('1 withdrawal then 3 deposits');
  const roundid = randomstr();
  const clientRoundId = randomstr();
  const amount = parseFloat(0.1);
  const betid1 = randomstr();

  const jsonResponseBalance = await qtcw.success_getbalance();
  let originalBalance = getBalance(jsonResponseBalance);

  const jsonresponseWithdraw = await qtcw.success_withdrawal(amount, betid1, roundid, clientRoundId);
  const currentBalance = getBalance(jsonresponseWithdraw);
  originalBalance = await verifyBalanceDebit(qtcw, originalBalance, currentBalance, amount);

  let jsonresponseDeposit = await qtcw.success_deposit(amount, randomstr(), roundid, betid1, clientRoundId, 1, 'false');
  let balanceAfterTxn = getBalance(jsonresponseDeposit);
  let currentBalance2 = await verifyBalanceCredit(qtcw, originalBalance, balanceAfterTxn, amount);
  originalBalance = currentBalance2;

  jsonresponseDeposit = await qtcw.success_deposit(amount, randomstr(), roundid, betid1, clientRoundId, 1, 'false');
  balanceAfterTxn = getBalance(jsonresponseDeposit);
  currentBalance2 = await verifyBalanceCredit(qtcw, originalBalance, balanceAfterTxn, amount);
  originalBalance = currentBalance2;

  console.log('');
  jsonresponseDeposit = await qtcw.success_deposit(amount, randomstr(), roundid, betid1, clientRoundId, 1, 'true');
  balanceAfterTxn = getBalance(jsonresponseDeposit);
  currentBalance2 = await verifyBalanceCredit(qtcw, originalBalance, balanceAfterTxn, amount, 1);
}

async function multiple_transactions(qtcw) {
  console.log('');
  console.log('Multiple transaction. 2 Withdrawals.  1 Rollback. 2 Deposits.');
  const roundid = randomstr();
  const clientRoundId = randomstr();
  const amount = parseFloat(0.1);
  const betid1 = randomstr();
  const betid2 = randomstr();
  const futureCompatible = 0;

  const jsonResponseBalance = await qtcw.success_getbalance();
  let originalBalance = getBalance(jsonResponseBalance);

  let jsonresponseWithdraw = await qtcw.success_withdrawal(amount, betid1, roundid, clientRoundId);
  let currentBalance = getBalance(jsonresponseWithdraw);
  originalBalance = await verifyBalanceDebit(qtcw, originalBalance, currentBalance, amount);

  jsonresponseWithdraw = await qtcw.success_withdrawal(amount, betid2, roundid, clientRoundId);
  currentBalance = getBalance(jsonresponseWithdraw);

  const jsonRollbackResponse = await qtcw.success_rollback_v2(betid2, amount, randomstr(), roundid, clientRoundId, futureCompatible, qtcw.config.walletsession, 'false');
  let balanceAfterTxn = getBalance(jsonRollbackResponse);
  currentBalance = await verifyBalanceCredit(qtcw, originalBalance, balanceAfterTxn, new Decimal(String(0)));

  let jsonresponseDeposit = await qtcw.success_deposit(amount, randomstr(), roundid, betid1, clientRoundId, 1, 'false');
  balanceAfterTxn = getBalance(jsonresponseDeposit);
  currentBalance = await verifyBalanceCredit(qtcw, originalBalance, balanceAfterTxn, amount);
  originalBalance = currentBalance;

  console.log('');
  jsonresponseDeposit = await qtcw.success_deposit(amount, randomstr(), roundid, betid1, clientRoundId, 1, 'true');
  balanceAfterTxn = getBalance(jsonresponseDeposit);
  currentBalance = await verifyBalanceCredit(qtcw, originalBalance, balanceAfterTxn, amount, 1);
}

async function idempotency(qtcw) {
  console.log('');
  await qtcw.success_verifysession();
  console.log('');
  await qtcw.success_getbalance();
  console.log('');
  const txnidwithdrawal = randomstr();
  const amount = qtcw.config.amount;
  const roundid = randomstr();
  const clientRoundId = randomstr();
  const jsonresponsewithdrawal = await qtcw.success_withdrawal_idempotency(amount, txnidwithdrawal, roundid, clientRoundId);
  const referenceidwithdrawal = jsonresponsewithdrawal.referenceId;
  console.log('');
  if (qtcw.config.rollbackurl) {
    const txnidrollback = randomstr();
    await qtcw.success_rollback_v2_idempotency(txnidwithdrawal, amount, txnidrollback, roundid, clientRoundId);
  } else {
    const txnidrollback = randomstr();
    await qtcw.success_rollback_idempotency(referenceidwithdrawal, amount, txnidrollback, roundid, clientRoundId);
  }
  console.log('');
  console.log('');

  console.log('Testing deposit idempotency');
  const roundid2 = randomstr();
  const txniddeposit = randomstr();
  const txnidwithdrawal2 = randomstr();
  const clientRoundId2 = randomstr();
  await qtcw.success_withdrawal(amount, txnidwithdrawal2, roundid2, clientRoundId2);
  await qtcw.success_deposit_idempotency(amount, txniddeposit, roundid2, txnidwithdrawal2, clientRoundId2);
  console.log('');
  console.log('');

  if (qtcw.config.rewardurl) {
    log('Testing reward idempotency');
    await qtcw.success_reward_idempotency(amount, randomstr());
  }
}

async function futureCompatibility(qtcw) {
  console.log('');
  await withdrawal(qtcw, 1);
  await deposit(qtcw, 1, false);
  if (qtcw.config.rollbackurl) {
    await rollback_v2(qtcw, 1);
  } else {
    await rollback(qtcw, 1);
  }

  if (qtcw.config.rewardurl) {
    console.log('');
    await reward(qtcw, 1);
  }
}

async function errors(qtcw) {
  await qtcw.error_getbalance_login_failed();
  console.log('');
  await qtcw.error_verifysession_login_failed();
  console.log('');
  await qtcw.error_verifysession_invalid_token();
  console.log('');
  await qtcw.error_verifysession_account_blocked();
  console.log('');
  await qtcw.error_withdrawal_invalid_token();
  console.log('');
  await qtcw.error_withdrawal_expired_token();
  console.log('');
  await qtcw.error_withdrawal_insufficient_funds();
  console.log('');
  await qtcw.error_withdrawal_account_blocked();
  console.log('');
  await qtcw.error_withdrawal_login_failed();
  console.log('');
  await qtcw.error_deposit_login_failed();
  console.log('');
  log('Testing Rollback v2 login failed');
  if (qtcw.config.rollbackurl) {
    const roundid = randomstr();
    const betid = randomstr();
    const clientRoundId = randomstr();
    await qtcw.success_withdrawal(0.1, betid, roundid, clientRoundId);
    await qtcw.error_rollback_v2_login_failed(betid, roundid);
    console.log('');
    log('Testing Rollback v2 Transaction not found');
    await qtcw.error_rollback_v2_transaction_not_found(roundid);
  } else {
    const roundid = randomstr();
    await qtcw.error_rollback_login_failed(roundid);
    console.log('');
    await qtcw.error_rollback_transaction_not_found(roundid);
  }

  if (qtcw.config.rewardurl) {
    console.log('');
    await qtcw.error_reward_login_failed();
    console.log('');
    await qtcw.error_reward_request_declined();
  }
}

async function verifyBalanceDebit(qtcw, originalBalance, balanceAfterTxn, amount) {
  const jsonResponseBalance = await qtcw.success_getbalance(false);
  const balanceGetBalance = getBalance(jsonResponseBalance);
  const debitedAmount = convertToDecimal(amount);
  const expectedBalance = originalBalance.minus(debitedAmount);
  qtcw.verifyequalbalance(balanceAfterTxn, balanceGetBalance, expectedBalance);
  return balanceAfterTxn;
}

async function verifyBalanceCredit(qtcw, originalBalance, balanceAfterTxn, amount, completed = 0) {
  let balanceGetBalance = balanceAfterTxn;
  if (qtcw.config.verifybalanceondeposit || completed) {
    const jsonResponseBalance = await qtcw.success_getbalance(false);
    balanceGetBalance = getBalance(jsonResponseBalance);
  }
  const creditedAmount = new Decimal(String(amount));
  const expectedBalance = originalBalance.plus(creditedAmount);
  qtcw.verifyequalbalance(balanceAfterTxn, balanceGetBalance, expectedBalance);
  return balanceAfterTxn;
}

async function commonwallet(qtcw) {
  const jsonResponseBalance = await qtcw.success_getbalance();
  let originalBalance = getBalance(jsonResponseBalance);
  console.log('');
  await qtcw.success_verifysession();
  console.log('');
  const roundid = randomstr();
  const clientRoundId = randomstr();
  const amount = parseInt(qtcw.config.amount);
  const betid = randomstr();
  const betid2 = randomstr();

  let jsonresponseWithdraw = await qtcw.success_withdrawal(amount, betid, roundid, clientRoundId);
  let currentBalance = getBalance(jsonresponseWithdraw);
  originalBalance = await verifyBalanceDebit(qtcw, originalBalance, currentBalance, amount);

  jsonresponseWithdraw = await qtcw.success_withdrawal(amount, betid2, roundid, clientRoundId);
  currentBalance = getBalance(jsonresponseWithdraw);
  originalBalance = await verifyBalanceDebit(qtcw, originalBalance, currentBalance, amount);
  const referenceid = jsonresponseWithdraw.referenceId;

  console.log('');
  const jsonresponseDeposit = await qtcw.success_deposit(amount, randomstr(), roundid, betid2, clientRoundId, 1);
  const balanceAfterTxn = getBalance(jsonresponseDeposit);
  const currentBalance2 = await verifyBalanceCredit(qtcw, originalBalance, balanceAfterTxn, amount, 1);

  console.log('');
  if (qtcw.config.rollbackurl) {
    originalBalance = getBalance(await qtcw.success_getbalance(false));
    const jsonresponse = await rollback_v2(qtcw);
    const balanceAfterTxn2 = getBalance(jsonresponse);
    const currentBalance3 = await verifyBalanceCredit(qtcw, originalBalance, balanceAfterTxn2, new Decimal(String(0))); // no balance changes
  } else {
    await rollback(qtcw);
  }

  console.log('');
  await reward(qtcw);
  await three_withdrawals_one_deposit(qtcw);
  await three_withdrawals_three_deposits(qtcw);
  await one_withdrawal_three_deposits(qtcw);
  await multiple_transactions(qtcw);
}

async function deposit_zero_balance(qtcw) {
  console.log('');
  console.log('Payout of Zero Amount with completed=true and no bet id');
  const roundid = randomstr();
  const clientRoundId = randomstr();
  const amount = parseInt(qtcw.config.amount);
  const betid = randomstr();
  const betid2 = randomstr();

  const jsonResponseBalance = await qtcw.success_getbalance();
  let originalBalance = getBalance(jsonResponseBalance);

  let jsonresponseWithdraw = await qtcw.success_withdrawal(amount, betid, roundid, clientRoundId);
  let currentBalance = getBalance(jsonresponseWithdraw);
  originalBalance = await verifyBalanceDebit(qtcw, originalBalance, currentBalance, amount);

  jsonresponseWithdraw = await qtcw.success_withdrawal(amount, betid2, roundid, clientRoundId);
  currentBalance = getBalance(jsonresponseWithdraw);
  originalBalance = await verifyBalanceDebit(qtcw, originalBalance, currentBalance, amount);
  const referenceid = jsonresponseWithdraw.referenceId;

  console.log('');
  let jsonresponseDeposit = await qtcw.success_deposit(amount, randomstr(), roundid, betid2, clientRoundId, 1, 'false');
  let balanceAfterTxn = getBalance(jsonresponseDeposit);
  currentBalance = await verifyBalanceCredit(qtcw, originalBalance, balanceAfterTxn, amount);

  console.log('');
  jsonresponseDeposit = await qtcw.success_deposit(0, randomstr(), roundid, null, clientRoundId, 1);
  balanceAfterTxn = getBalance(jsonresponseDeposit);
  currentBalance = await verifyBalanceCredit(qtcw, originalBalance, balanceAfterTxn, amount);
}

async function all(qtcw) {
  console.log(`Performing test: ${method}`);
  console.log('-----------------------');
  await getbalance(qtcw);
  console.log('');
  console.log('');

  console.log('Performing test: common wallet');
  console.log('-----------------------');
  await commonwallet(qtcw);
  console.log('');
  console.log('');

  console.log('Performing test: idempotency');
  console.log('-----------------------');
  await idempotency(qtcw);
  console.log('');
  console.log('');

  console.log('Performing test: errors');
  console.log('-----------------------');
  await errors(qtcw);
  console.log('');
  console.log('');

  console.log('Performing test: future compatibility');
  console.log('-----------------------');
  console.log('');
  console.log('');
  await futureCompatibility(qtcw);
  console.log('');
  console.log('');

  return 0;
}

// Main execution
(async () => {
  const start = new Date();
  const qtcw = new QTCW('cw_qtcw_tester.cfg');

  console.log('This is a script to perform a simple verification of a common wallet');
  console.log('');

  console.log(`Wallet URL: ${qtcw.config.walleturl}`);
  console.log(`Session ID: ${qtcw.config.walletsession}`);
  console.log(`Pass Key: ${qtcw.config.passkey}`);
  console.log('');

  let fail = false;

  if (!qtcw.config.walletsession || qtcw.config.walletsession.length === 0) {
    console.log('Please supply a session ID in the file \'cw_qtcw_tester.cfg\'');
    fail = true;
  }

  if (qtcw.config.walleturl === 'http://enter_url_here') {
    console.log('Please supply your wallet URL in the file \'cw_qtcw_tester.cfg\'');
    fail = true;
  }

  if (fail) {
    process.exit(0);
  }

  if (process.argv.length <= 2) {
    fail = true;
  }

  let method = '';
  if (process.argv.length >= 3) {
    method = process.argv[2];
    const validMethods = ['commonwallet', 'verifysession', 'getbalance', 'idempotency', 
                          'withdrawal', 'deposit', 'rollback', 'future', 'errors', 'reward', 'all'];
    if (!validMethods.includes(method)) {
      fail = true;
    }
  }

  if (fail) {
    let msg = `Usage: ${process.argv[1]} <getaccount|gameround|rollback|reward|idempotency|errors|future|all> \n`;
    msg += ' commonwallet:\tPerforms a Full Cycle Common Wallet request \n';
    msg += ' verifysession:\tPerforms a Verify Session request \n';
    msg += ' getbalance:\tPerforms a GetBalance request \n';
    msg += ' withdrawal:\tPerforms a Withdrawal request \n';
    msg += ' deposit:\tPerforms a Deposit request \n';
    msg += ' rollback:\tPerforms a GetAccount, GetBalance, Wager and Rollback \n';
    msg += ' reward:\tPerforms a Reward request \n';
    msg += ' idempotency:\tResends a Wager and Result to see that idempotency is working \n';
    msg += ' errors:\tTests multiple error cases to verify the returned error codes \n';
    msg += ' future:\tTests withdrawal, deposit and rollback for future compatibility\n';
    msg += ' all:\t\tPerforms a thorough testing\n';
    console.log(msg);
    process.exit(0);
  }

  try {
    switch (method) {
      case 'commonwallet':
        console.log(`Performing test: ${method}`);
        console.log('-----------------------');
        await commonwallet(qtcw);
        break;
      case 'verifysession':
        console.log(`Performing test: ${method}`);
        console.log('-----------------------');
        await verifysession(qtcw);
        break;
      case 'getbalance':
        console.log(`Performing test: ${method}`);
        console.log('-----------------------');
        await getbalance(qtcw);
        break;
      case 'withdrawal':
        console.log(`Performing test: ${method}`);
        console.log('-----------------------');
        await withdrawal(qtcw);
        break;
      case 'deposit':
        console.log(`Performing test: ${method}`);
        console.log('-----------------------');
        await deposit(qtcw);
        break;
      case 'rollback':
        if (qtcw.config.rollbackurl) {
          console.log('Performing test: rollback_v2');
          console.log('-----------------------');
          await rollback_v2(qtcw);
        } else {
          console.log('Performing test: rollback');
          console.log('-----------------------');
          await rollback(qtcw);
        }
        break;
      case 'reward':
        console.log(`Performing test: ${method}`);
        console.log('-----------------------');
        await reward(qtcw);
        break;
      case 'idempotency':
        console.log(`Performing test: ${method}`);
        console.log('-----------------------');
        await idempotency(qtcw);
        break;
      case 'errors':
        console.log(`Performing test: ${method}`);
        console.log('-----------------------');
        await errors(qtcw);
        break;
      case 'all':
        console.log(`Performing test: ${method}`);
        console.log('-----------------------');
        await all(qtcw);
        break;
      case 'future':
        console.log(`Performing tests: ${method}`);
        console.log('-----------------------');
        await futureCompatibility(qtcw);
        break;
    }

    const end = new Date();
    const elapsed = Math.floor((end - start) / 1000);

    if (qtcw.config.error) {
      log('Test NOT successful!');
    } else if (qtcw.config.warning) {
      log(`Test completed with warnings! Common Wallet Tester completed in ${elapsed} seconds`);
    } else {
      log(`Test successful! Common Wallet Tester completed in ${elapsed} seconds`);
    }
  } catch (err) {
    error(`Test failed with error: ${err.message}\n${err.stack}`);
  }
})();
