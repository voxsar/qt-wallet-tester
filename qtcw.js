const { log, error, warning, randomstr, doRequest } = require('./utils');
const Decimal = require('decimal.js');

/**
 * Verify a key exists in JSON response
 * @param {object} json - JSON object to check
 * @param {string} key - Key to verify
 * @param {string} dataType - Expected data type (optional)
 */
function verifykeyexist(json, key, dataType = null) {
	if (!(key in json)) {
		error(`Error validating json field ${key}. Not present!`);
	}

	const value = json[key];

	if (dataType === 'float') {
		if (typeof value !== 'number') {
			const actual = typeof value;
			error(`Invalid data type for field '${key}' Expected: number actual: ${actual}`);
		}
	} else if (dataType === 'string') {
		if (typeof value !== 'string') {
			const actual = typeof value;
			error(`Invalid data type for field '${key}' Expected: string actual: ${actual}`);
		}
	} else if (dataType !== null) {
		if (typeof value !== dataType) {
			const actual = typeof value;
			//error(`Invalid data type for field '${key}' Expected: ${dataType} actual: ${actual}`);
		}
	}
}

/**
 * Convert to Decimal for precise calculations
 * @param {*} source - Value to convert
 * @returns {Decimal} Decimal value
 */
function convertToDecimal(source) {
	return new Decimal(String(source));
}

/**
 * Verify balance and reference ID match
 * @param {object} jsonresponse1 - First response
 * @param {object} jsonresponse2 - Second response
 */
function verifyequalbalancereferenceid(jsonresponse1, jsonresponse2) {
	const balance1 = jsonresponse1.balance;
	const referenceid1 = jsonresponse1.referenceId;
	const balance2 = jsonresponse2.balance;
	const referenceid2 = jsonresponse2.referenceId;

	let notmatchedmessage = '';

	if (!convertToDecimal(balance1).equals(convertToDecimal(balance2))) {
		notmatchedmessage += `Balance do not match. ${balance1} != ${balance2} `;
	}

	if (referenceid1 !== referenceid2) {
		notmatchedmessage += `Reference id do not match ${referenceid1} != ${referenceid2} `;
	}

	if (notmatchedmessage.length > 0) {
		error(notmatchedmessage);
	}
}

/**
 * Convert expected error to error code
 * @param {string} expectederror - Expected error type
 * @returns {string} Error code
 */
function expectedErrorToErrorCode(expectederror) {
	const errorMap = {
		'loginfailed': 'LOGIN_FAILED',
		'invalidtoken': 'INVALID_TOKEN',
		'accountblocked': 'ACCOUNT_BLOCKED',
		'insufficientfunds': 'INSUFFICIENT_FUNDS',
		'requestdeclined': 'REQUEST_DECLINED',
		'transactionnotfound': 'TRANSACTION_NOT_FOUND'
	};

	return errorMap[expectederror] || 'unrecognized expectederror';
}

/**
 * QTCW Class - Main class for wallet operations
 */
class QTCW {
	constructor(filename) {
		const { Config } = require('./utils');
		this.config = new Config(filename);
		this.config.error = false;
		this.config.warning = false;
		this.config.resend = false;
	}

	/**
	 * Get current date time in ISO format with timezone
	 * @returns {string} Formatted datetime
	 */
	getDateTime() {
		const dt = new Date();
		const offset = -dt.getTimezoneOffset();
		const sign = offset >= 0 ? '+' : '-';
		const hours = Math.floor(Math.abs(offset) / 60).toString().padStart(2, '0');
		const minutes = (Math.abs(offset) % 60).toString().padStart(2, '0');
		const isoString = dt.toISOString().slice(0, -1); // Remove 'Z'
		return `${isoString}[${sign}${hours}:${minutes}]`;
	}

	/**
	 * Verify balance equality
	 * @param {Decimal} balanceAfterTxn - Balance after transaction
	 * @param {Decimal} balanceGetBalance - Balance from get balance
	 * @param {Decimal} expectedBalance - Expected balance
	 */
	verifyequalbalance(balanceAfterTxn, balanceGetBalance, expectedBalance) {
		let notmatchedmessage = '';

		if (!balanceAfterTxn.equals(balanceGetBalance)) {
			notmatchedmessage += `Balance After Txn and Get Balance Does Not Match ${balanceAfterTxn} != ${balanceGetBalance} `;
		}
		if (!balanceAfterTxn.equals(expectedBalance)) {
			notmatchedmessage += `Balance After Txn Is Not Expected: Expected: ${expectedBalance} Actual: ${balanceAfterTxn} `;
		}

		if (notmatchedmessage.length > 0) {
			error(notmatchedmessage);
		}
	}

	/**
	 * Check response from API
	 * @param {object} response - HTTP response
	 * @param {string} request - Request type
	 * @param {string} expectederror - Expected error (if any)
	 * @param {boolean} shouldLog - Whether to log
	 * @returns {object} JSON response
	 */
	checkresponse(response, request, expectederror, shouldLog = true) {
		const httpcode = response.status;

		if (shouldLog) {
			log(`Http status code is ${httpcode}`);
		}

		try {
			const jsonresponse = response.data;
			log(`Response body is ${JSON.stringify(jsonresponse)}`);

			const contentType = response.headers['content-type'] || '';
			if (!contentType.includes('application/json')) {
				error(`Content-Type header must be application/json, actual: ${contentType}`);
			}

			if (httpcode >= 400) {
				this.checkerrorresponse(httpcode, jsonresponse, request, expectederror);
			} else if (httpcode <= 299 && expectederror) {
				const errorCode = expectedErrorToErrorCode(expectederror);
				error(`Expected error is ${errorCode} but actual is no error`);
			} else {
				this.checksuccessfulresponse(jsonresponse, request);
			}

			return jsonresponse;
		} catch (e) {
			error(`Failed to parse response JSON: ${JSON.stringify(response)} ${e.message}`);
		}
	}

	/**
	 * Check successful response
	 * @param {object} jsonresponse - JSON response
	 * @param {string} request - Request type
	 */
	checksuccessfulresponse(jsonresponse, request) {
		switch (request) {
			case 'verifysession':
				return this.checkverifysession(jsonresponse);
			case 'getbalance':
				return this.checkgetbalance(jsonresponse);
			case 'withdrawal':
				return this.checkwithdrawal(jsonresponse);
			case 'deposit':
				return this.checkwithdrawal(jsonresponse);
			case 'rollback':
				return this.checkrollback(jsonresponse);
		}
	}

	/**
	 * Check error response
	 * @param {number} httpcode - HTTP status code
	 * @param {object} jsonresponse - JSON response
	 * @param {string} request - Request type
	 * @param {string} expectederror - Expected error type
	 */
	checkerrorresponse(httpcode, jsonresponse, request, expectederror) {
		const errorMap = {
			'loginfailed': [401, 'LOGIN_FAILED'],
			'invalidtoken': [400, 'INVALID_TOKEN'],
			'accountblocked': [403, 'ACCOUNT_BLOCKED'],
			'insufficientfunds': [400, 'INSUFFICIENT_FUNDS'],
			'requestdeclined': [400, 'REQUEST_DECLINED'],
			'transactionnotfound': [404, 'TRANSACTION_NOT_FOUND']
		};

		if (expectederror in errorMap) {
			const [expectedCode, expectedError] = errorMap[expectederror];
			return this.checkerrorcodeandmessage(httpcode, jsonresponse, expectedCode, expectedError);
		} else {
			error(`Unhandled error, this must have checking: status=${httpcode} body=${JSON.stringify(jsonresponse)}`);
		}
	}

	/**
	 * Check error code and message
	 * @param {number} actualhttpcode - Actual HTTP code
	 * @param {object} actualjsonresponse - Actual JSON response
	 * @param {number} expectedhttpcode - Expected HTTP code
	 * @param {string} expectederrorcode - Expected error code
	 */
	checkerrorcodeandmessage(actualhttpcode, actualjsonresponse, expectedhttpcode, expectederrorcode) {
		console.log("error actualjsonresponse ", actualjsonresponse);
		const actualerrorcode = actualjsonresponse.code.toUpperCase();
		let notmatchedmessage = '';

		if (actualhttpcode !== expectedhttpcode) {
			notmatchedmessage += `Expected http code is ${expectedhttpcode} but actual is ${actualhttpcode} `;
		}
		if (actualerrorcode !== expectederrorcode) {
			notmatchedmessage += `Expected error code is ${expectederrorcode} but actual is ${actualerrorcode}`;
		}

		if (notmatchedmessage.length > 0) {
			error(notmatchedmessage);
		}
	}

	checkverifysession(root) {
		verifykeyexist(root, 'balance', 'float');
		verifykeyexist(root, 'currency', 'string');
	}

	checkgetbalance(root) {
		verifykeyexist(root, 'balance', 'float');
		verifykeyexist(root, 'currency', 'string');
	}

	checkwithdrawal(root) {
		verifykeyexist(root, 'balance', 'float');
		verifykeyexist(root, 'referenceId', 'string');
	}

	checkrollback(root) {
		verifykeyexist(root, 'balance', 'float');
		verifykeyexist(root, 'referenceId', 'string');
	}

	checkrollback_transaction_not_found(root) {
		verifykeyexist(root, 'balance', 'float');
	}

	checkrollback_v2(root) {
		verifykeyexist(root, 'balance', 'float');
		verifykeyexist(root, 'referenceId', 'string');
	}

	/**
	 * Prepare URL for request
	 * @param {string} request - Request type
	 * @param {object} vars - Variables
	 * @returns {string} URL
	 */
	prepareurl(request, vars) {
		switch (request) {
			case 'getbalance':
			case 'getbalance_expired_session':
				return `${this.config.walleturl}accounts/${encodeURIComponent(vars.playerid)}/balance?gameId=${vars.gameid}`;
			case 'getbalance_without_session':
				return `${this.config.walleturl}accounts/${encodeURIComponent(vars.playerid)}/balance`;
			case 'verifysession':
				return `${this.config.walleturl}accounts/${encodeURIComponent(vars.playerid)}/session?gameId=${vars.gameid}`;
			case 'withdrawal':
				return this.config.withdrawurl;
			case 'deposit':
				return this.config.depositurl;
			case 'rollback':
				return `${this.config.walleturl}transactions/${vars.referenceid}/rollback`;
			case 'rollback_v2':
				return this.config.rollbackurl;
			case 'reward':
				return this.config.rewardurl;
		}
	}

	/**
	 * Execute REST request
	 * @param {string} operation - Operation type
	 * @param {object} vars - Variables
	 * @param {object} customheaders - Custom headers
	 * @param {object} payload - Request payload
	 * @param {string} expectederror - Expected error
	 * @param {boolean} shouldLog - Whether to log
	 * @returns {Promise<object>} JSON response
	 */
	async __execute_rest(operation, vars, customheaders, payload, expectederror, shouldLog = true) {
		const reqline = this.prepareurl(operation, vars);
		const response = await doRequest(reqline, customheaders, payload);
		const jsonresponse = this.checkresponse(response, operation, expectederror, shouldLog);
		return jsonresponse;
	}

	/**
	 * Get balance from response or fetch new balance
	 * @param {object} jsonResponse - JSON response (optional)
	 * @returns {Promise<Decimal>} Balance
	 */
	async getBalance(jsonResponse = null) {
		if (jsonResponse === null) {
			jsonResponse = await this.success_getbalance(false);
		}
		const balance = jsonResponse.balance;
		return convertToDecimal(balance);
	}

	// Success methods
	async success_verifysession() {
		log('Testing VerifySession');
		const vars = {
			playerid: this.config.playerid,
			gameid: this.config.gameid
		};
		const customheaders = {
			'Pass-Key': this.config.passkey,
			'Wallet-Session': this.config.walletsession
		};
		return await this.__execute_rest('verifysession', vars, customheaders, {}, null);
	}

	async success_getbalance(shouldLog = true) {
		if (shouldLog) {
			log('Testing GetBalance');
		} else {
			log('GetBalance');
		}
		const vars = {
			playerid: this.config.playerid,
			gameid: this.config.gameid
		};
		const customheaders = {
			'Pass-Key': this.config.passkey,
			'Wallet-Session': this.config.walletsession
		};
		return await this.__execute_rest('getbalance', vars, customheaders, {}, null, shouldLog);
	}

	async success_getbalance_without_session(shouldLog = true) {
		if (shouldLog) {
			log('Testing GetBalance with Without Wallet-Session and Game Id');
		} else {
			log('GetBalance');
		}
		const vars = {
			playerid: this.config.playerid
		};
		const customheaders = {
			'Pass-Key': this.config.passkey
		};
		return await this.__execute_rest('getbalance_without_session', vars, customheaders, {}, null, shouldLog);
	}

	async success_getbalance_expired_session(shouldLog = true) {
		if (shouldLog) {
			log('Testing GetBalance with Expired Wallet-Session and Game Id');
		} else {
			log('GetBalance');
		}
		const vars = {
			playerid: this.config.playerid,
			gameid: this.config.gameid
		};
		const customheaders = {
			'Pass-Key': this.config.passkey,
			'Wallet-Session': this.config.walletsessionExpired
		};
		return await this.__execute_rest('getbalance_expired_session', vars, customheaders, {}, null, shouldLog);
	}

	async success_withdrawal(amount, txnid, roundid, clientRoundId, futureCompatible = 0) {
		log(`Testing Withdrawal with amount of ${amount} and txnid of ${txnid} roundid : ${roundid} clientRoundId: ${clientRoundId}`);
		const customheaders = {
			'Pass-Key': this.config.passkey,
			'Wallet-Session': this.config.walletsession
		};
		const body = {
			txnType: 'DEBIT',
			txnId: txnid,
			playerId: this.config.playerid,
			roundId: roundid,
			clientRoundId: clientRoundId,
			amount: parseFloat(amount),
			currency: this.config.currency,
			gameId: this.config.gameid,
			device: this.config.device,
			clientType: this.config.clienttype,
			category: this.config.category,
			completed: this.config.completed,
			created: this.getDateTime()
		};

		if (futureCompatible) {
			body.dummy = randomstr();
		}

		return await this.__execute_rest('withdrawal', {}, customheaders, body, null);
	}

	async success_deposit(amount, txnid, roundid, betId, clientRoundId, futureCompatible = 0, completed = 'true') {
		log(`Testing Deposit with amount of ${amount}, completed = ${completed}`);
		const customheaders = {
			'Pass-Key': this.config.passkey,
			'Wallet-Session': this.config.walletsession
		};

		const body = {
			txnType: 'CREDIT',
			txnId: txnid,
			playerId: this.config.playerid,
			roundId: roundid,
			clientRoundId: clientRoundId,
			amount: parseFloat(amount),
			currency: this.config.currency,
			gameId: this.config.gameid,
			device: this.config.device,
			clientType: this.config.clienttype,
			category: this.config.category,
			completed: completed,
			created: this.getDateTime()
		};

		if (betId !== null) {
			body.betId = betId;
		}

		if (futureCompatible) {
			body.dummy = randomstr();
		}

		return await this.__execute_rest('deposit', {}, customheaders, body, null);
	}

	async success_deposit_expiredSession(roundId, txnId, betId, clientRoundId, amount, completed = 'true') {
		log('Performing Deposit Expired Wallet Session');
		const customheaders = {
			'Pass-Key': this.config.passkey,
			'Wallet-Session': this.config.walletsessionExpired
		};

		const body = {
			txnType: 'CREDIT',
			txnId: txnId,
			playerId: this.config.playerid,
			roundId: roundId,
			betId: betId,
			clientRoundId: clientRoundId,
			amount: parseFloat(amount),
			currency: this.config.currency,
			gameId: this.config.gameid,
			device: this.config.device,
			clientType: this.config.clienttype,
			category: this.config.category,
			completed: completed,
			created: this.getDateTime()
		};

		return await this.__execute_rest('deposit', {}, customheaders, body, null);
	}

	async success_rollback(referenceid, amount, txnid, roundid, clientRoundId, futureCompatible = 0, completed = 'true') {
		log('Testing Rollback');
		log(`Rollback reference id of ${referenceid} and amount of ${amount}`);
		const customheaders = {
			'Pass-Key': this.config.passkey,
			'Wallet-Session': this.config.walletsession
		};

		const vars = {
			referenceid: referenceid
		};

		const body = {
			txnId: randomstr(),
			playerId: this.config.playerid,
			roundId: roundid,
			clientRoundId: clientRoundId,
			amount: parseFloat(amount),
			currency: this.config.currency,
			gameId: this.config.gameid,
			device: this.config.device,
			clientType: this.config.clienttype,
			category: this.config.category,
			completed: completed,
			created: this.getDateTime()
		};

		if (futureCompatible) {
			body.dummy = randomstr();
		}

		return await this.__execute_rest('rollback', vars, customheaders, body, null);
	}

	async success_rollback_v2(betid, amount, txnid, roundid, clientRoundId, futureCompatible = 0, walletsession = null, completed = 'true') {
		log('Testing Rollback v2');
		log(`Rollback v2 bet id of ${betid} and amount of ${amount}`);
		const customheaders = {
			'Pass-Key': this.config.passkey,
			'Wallet-Session': this.config.walletsession
		};

		const vars = {
			referenceid: betid
		};

		const body = {
			betId: betid,
			txnId: txnid,
			playerId: this.config.playerid,
			roundId: roundid,
			clientRoundId: clientRoundId,
			amount: parseFloat(amount),
			currency: this.config.currency,
			gameId: this.config.gameid,
			device: this.config.device,
			clientType: this.config.clienttype,
			category: this.config.category,
			completed: completed,
			created: this.getDateTime()
		};

		if (futureCompatible) {
			body.dummy = randomstr();
		}

		const jsonresponse = await this.__execute_rest('rollback_v2', vars, customheaders, body, null);
		this.checkrollback_v2(jsonresponse);
		return jsonresponse;
	}

	async success_rollback_v2_expired_session(betid, amount, txnid, roundid, clientRoundId, futureCompatible = 0, walletsession = null, completed = 'true') {
		log('Testing Rollback v2 with expired session');
		const customheaders = {
			'Pass-Key': this.config.passkey,
			'Wallet-Session': this.config.walletsessionExpired
		};

		const vars = {
			referenceid: betid
		};

		const body = {
			betId: betid,
			txnId: txnid,
			playerId: this.config.playerid,
			roundId: roundid,
			clientRoundId: clientRoundId,
			amount: parseFloat(amount),
			currency: this.config.currency,
			gameId: this.config.gameid,
			device: this.config.device,
			clientType: this.config.clienttype,
			category: this.config.category,
			completed: completed,
			created: this.getDateTime()
		};

		if (futureCompatible) {
			body.dummy = randomstr();
		}

		return await this.__execute_rest('rollback_v2', vars, customheaders, body, null);
	}

	async success_reward(amount, txnid, futureCompatible = 0) {
		log(`Testing Reward with amount of ${amount} and txnid of ${txnid}`);
		const customheaders = {
			'Pass-Key': this.config.passkey
		};
		return await this.reward(amount, txnid, futureCompatible, customheaders, null);
	}

	async reward(amount, txnid, futureCompatible = 0, customheaders = {}, expectederror = null) {
		const body = {
			rewardType: 'TOURNAMENT_REWARD',
			rewardTitle: 'Thunderkick Championship',
			txnId: txnid,
			playerId: this.config.playerid,
			amount: parseFloat(amount),
			currency: this.config.currency,
			created: this.getDateTime()
		};

		if (futureCompatible) {
			body.dummy = randomstr();
		}

		return await this.__execute_rest('reward', {}, customheaders, body, expectederror);
	}

	// Idempotency methods
	async success_withdrawal_idempotency(amount, txnid, roundid, clientRoundId) {
		log('Note: performing a withdrawal against the wallet platform');
		const jsonResponseBalance = await this.success_getbalance(false);
		const originalBalance = await this.getBalance(jsonResponseBalance);

		const jsonresponsefirst = await this.success_withdrawal(amount, txnid, roundid, clientRoundId);
		const balanceAfterTxn = await this.getBalance(jsonresponsefirst);
		const balanceGetBalance = await this.getBalance(await this.success_getbalance(false));
		this.verifyequalbalance(balanceAfterTxn, balanceGetBalance, originalBalance.minus(convertToDecimal(amount)));

		log('Note: re-sending the withdrawal with the same transaction ID');
		const jsonresponsesecond = await this.success_withdrawal(amount, txnid, roundid, clientRoundId);
		const balanceAfterTxn2 = await this.getBalance(jsonresponsesecond);
		const balanceGetBalance2 = await this.getBalance();
		this.verifyequalbalance(balanceAfterTxn2, balanceGetBalance2, originalBalance.minus(convertToDecimal(amount)));

		verifyequalbalancereferenceid(jsonresponsefirst, jsonresponsesecond);
		return jsonresponsefirst;
	}

	async success_deposit_idempotency(amount, txnid, roundid, betid, clientRoundId) {
		log('Note: performing a deposit against the wallet platform');
		const originalBalance = await this.getBalance();
		const jsonresponsefirst = await this.success_deposit(amount, txnid, roundid, betid, clientRoundId);
		const balanceAfterTxn = await this.getBalance(jsonresponsefirst);
		const balanceGetBalance = await this.getBalance();
		const amountChanged = originalBalance.plus(convertToDecimal(amount));
		this.verifyequalbalance(balanceAfterTxn, balanceGetBalance, amountChanged);

		log('Note: re-sending the deposit with the same transaction ID');
		const jsonresponsesecond = await this.success_deposit(amount, txnid, roundid, betid, clientRoundId);
		const balanceAfterTxn2 = await this.getBalance(jsonresponsesecond);
		this.verifyequalbalance(balanceAfterTxn2, balanceGetBalance, amountChanged);

		verifyequalbalancereferenceid(jsonresponsefirst, jsonresponsesecond);
		return jsonresponsefirst;
	}

	async success_rollback_idempotency(referenceid, amount, txnid, roundid, clientRoundId) {
		log('Note: performing a rollback against the wallet platform');
		const jsonresponsefirst = await this.success_rollback(referenceid, amount, txnid, roundid, clientRoundId);

		log('Note: re-sending the rollback with the same transaction ID');
		const jsonresponsesecond = await this.success_rollback(referenceid, amount, txnid, roundid, clientRoundId);

		verifyequalbalancereferenceid(jsonresponsefirst, jsonresponsesecond);
		return jsonresponsefirst;
	}

	async success_rollback_v2_idempotency(betid, amount, txnid, roundid, clientRoundId) {
		console.log('==================');
		log('Note: performing a rollback v2 against the wallet platform');
		const originalBalance = await this.getBalance();
		const jsonresponsefirst = await this.success_rollback_v2(betid, amount, txnid, roundid, clientRoundId);
		const balanceAfterTxn = await this.getBalance(jsonresponsefirst);
		const balanceGetBalance = await this.getBalance();
		const amountChanged = originalBalance.plus(convertToDecimal(amount));
		this.verifyequalbalance(balanceAfterTxn, balanceGetBalance, amountChanged);

		log('Note: re-sending the rollback v2 with the same transaction ID');
		const jsonresponsesecond = await this.success_rollback_v2(betid, amount, txnid, roundid, clientRoundId);
		const balanceAfterTxn2 = await this.getBalance(jsonresponsesecond);
		const balanceGetBalance2 = await this.getBalance();
		this.verifyequalbalance(balanceAfterTxn2, balanceGetBalance2, amountChanged);

		verifyequalbalancereferenceid(jsonresponsefirst, jsonresponsesecond);
		return jsonresponsefirst;
	}

	async success_reward_idempotency(amount, txnid) {
		log('Note: performing a reward against the wallet platform');
		const balanceBeforeTxn = await this.getBalance(await this.success_getbalance(false));

		const jsonResponseFirst = await this.success_reward(amount, txnid);
		const balanceAfterTxn = await this.getBalance(jsonResponseFirst);
		const jsonResponseGetBalance = await this.getBalance(await this.success_getbalance(false));

		this.verifyequalbalance(balanceAfterTxn, jsonResponseGetBalance, balanceBeforeTxn.plus(convertToDecimal(amount)));

		log('Note: re-sending the reward with the same transaction ID');

		const jsonResponseSecond = await this.success_reward(amount, txnid);
		const balanceAfterTxn2 = await this.getBalance(jsonResponseSecond);
		const jsonResponseGetBalance2 = await this.getBalance(await this.success_getbalance(false));
		this.verifyequalbalance(balanceAfterTxn2, jsonResponseGetBalance2, balanceBeforeTxn.plus(convertToDecimal(amount)));

		verifyequalbalancereferenceid(jsonResponseFirst, jsonResponseSecond);
		return jsonResponseFirst;
	}

	// Error methods
	async error_getbalance_login_failed() {
		log('Testing Get balance request declined');
		const vars = {
			playerid: this.config.playerid,
			gameid: this.config.gameid
		};
		const customheaders = {
			'Pass-Key': randomstr()
		};
		return await this.__execute_rest('getbalance', vars, customheaders, {}, 'loginfailed');
	}

	async error_verifysession_login_failed() {
		log('Testing Verify session login failed');
		const vars = {
			playerid: this.config.playerid,
			gameid: this.config.gameid
		};
		const customheaders = {
			'Pass-Key': randomstr(),
			'Wallet-Session': this.config.walletsession
		};
		return await this.__execute_rest('verifysession', vars, customheaders, {}, 'loginfailed');
	}

	async error_verifysession_invalid_token() {
		log('Testing Verify session invalid token');
		const vars = {
			playerid: this.config.playerid,
			gameid: this.config.gameid
		};
		const customheaders = {
			'Pass-Key': this.config.passkey,
			'Wallet-Session': randomstr()
		};
		return await this.__execute_rest('verifysession', vars, customheaders, {}, 'invalidtoken');
	}

	async error_verifysession_account_blocked() {
		if (this.config.blockedplayerid === '') {
			return;
		}

		log('Testing Verify session account blocked');
		const vars = {
			playerid: this.config.blockedplayerid,
			gameid: this.config.gameid
		};
		const customheaders = {
			'Pass-Key': this.config.passkey,
			'Wallet-Session': this.config.blockedwalletsession
		};
		return await this.__execute_rest('verifysession', vars, customheaders, {}, 'accountblocked');
	}

	async error_withdrawal_insufficient_funds() {
		log('Testing Withdrawal insufficient funds');
		const amount = this.config.amounttoreachinsufficientfund;
		log(`Testing Withdrawal with amount of ${amount}`);
		const customheaders = {
			'Pass-Key': this.config.passkey,
			'Wallet-Session': this.config.walletsession
		};
		const body = {
			txnType: 'DEBIT',
			txnId: randomstr(),
			playerId: this.config.playerid,
			roundId: randomstr(),
			amount: parseFloat(amount),
			currency: this.config.currency,
			gameId: this.config.gameid,
			device: this.config.device,
			clientType: this.config.clienttype,
			category: this.config.category,
			completed: this.config.completed,
			created: this.getDateTime()
		};

		return await this.__execute_rest('withdrawal', {}, customheaders, body, 'insufficientfunds');
	}

	async error_withdrawal_account_blocked() {
		if (this.config.blockedplayerid === '') {
			return;
		}

		log('Testing Withdrawal account blocked');
		const amount = 1;
		log(`Testing Withdrawal with amount of ${amount}`);
		const customheaders = {
			'Pass-Key': this.config.passkey,
			'Wallet-Session': this.config.blockedwalletsession
		};
		const body = {
			txnType: 'DEBIT',
			txnId: randomstr(),
			playerId: this.config.blockedplayerid,
			roundId: randomstr(),
			amount: amount,
			currency: this.config.currency,
			gameId: this.config.gameid,
			device: this.config.device,
			clientType: this.config.clienttype,
			category: this.config.category,
			completed: this.config.completed,
			created: this.getDateTime()
		};

		return await this.__execute_rest('withdrawal', {}, customheaders, body, 'accountblocked');
	}

	async error_withdrawal_invalid_token() {
		log('Testing Withdrawal invalid token');
		const amount = 1;
		log(`Testing Withdrawal with amount of ${amount}`);
		const customheaders = {
			'Pass-Key': this.config.passkey,
			'Wallet-Session': randomstr()
		};
		const body = {
			txnType: 'DEBIT',
			txnId: randomstr(),
			playerId: this.config.playerid,
			roundId: randomstr(),
			amount: amount,
			currency: this.config.currency,
			gameId: this.config.gameid,
			device: this.config.device,
			clientType: this.config.clienttype,
			category: this.config.category,
			completed: this.config.completed,
			created: this.getDateTime()
		};

		return await this.__execute_rest('withdrawal', {}, customheaders, body, 'invalidtoken');
	}

	async error_withdrawal_login_failed() {
		log('Testing Withdrawal login failed');
		const amount = 1;
		log(`Testing Withdrawal with amount of ${amount}`);
		const customheaders = {
			'Pass-Key': randomstr(),
			'Wallet-Session': this.config.walletsession
		};
		const body = {
			txnType: 'DEBIT',
			txnId: randomstr(),
			playerId: this.config.playerid,
			roundId: randomstr(),
			amount: amount,
			currency: this.config.currency,
			gameId: this.config.gameid,
			device: this.config.device,
			clientType: this.config.clienttype,
			category: this.config.category,
			completed: this.config.completed,
			created: this.getDateTime()
		};

		return await this.__execute_rest('withdrawal', {}, customheaders, body, 'loginfailed');
	}

	async error_withdrawal_expired_token() {
		log('Testing Withdrawal expired wallet session');
		const amount = 1;
		log(`Testing Withdrawal with amount of ${amount}`);
		const customheaders = {
			'Pass-Key': this.config.passkey,
			'Wallet-Session': this.config.walletsessionExpired
		};
		const body = {
			txnType: 'DEBIT',
			txnId: randomstr(),
			playerId: this.config.playerid,
			roundId: randomstr(),
			amount: amount,
			currency: this.config.currency,
			gameId: this.config.gameid,
			device: this.config.device,
			clientType: this.config.clienttype,
			category: this.config.category,
			completed: this.config.completed,
			created: this.getDateTime()
		};

		return await this.__execute_rest('withdrawal', {}, customheaders, body, 'invalidtoken');
	}

	async error_deposit_login_failed() {
		log('Testing Deposit login failed');
		const roundid = randomstr();
		const betid = randomstr();
		const clientRoundId = randomstr();
		const amount = 0.1;
		await this.success_withdrawal(amount, betid, roundid, clientRoundId);

		const customheaders = {
			'Pass-Key': randomstr(),
			'Wallet-Session': this.config.walletsession
		};
		const body = {
			txnType: 'DEBIT',
			txnId: randomstr(),
			playerId: this.config.playerid,
			roundId: randomstr(),
			amount: amount,
			currency: this.config.currency,
			gameId: this.config.gameid,
			device: this.config.device,
			clientType: this.config.clienttype,
			category: this.config.category,
			completed: this.config.completed,
			created: this.getDateTime()
		};

		return await this.__execute_rest('deposit', {}, customheaders, body, 'loginfailed');
	}

	async error_rollback_login_failed(roundid, completed = 'true') {
		log('Testing Rollback login failed');
		const amount = parseFloat(this.config.amount);
		const jsonresponse = await this.success_withdrawal(amount, randomstr(), roundid, randomstr());
		const referenceid = jsonresponse.referenceId;
		log(`Rollback reference id of ${referenceid} and amount of ${amount}`);
		const customheaders = {
			'Pass-Key': randomstr()
		};

		const vars = {
			referenceid: referenceid
		};

		const body = {
			txnId: randomstr(),
			playerId: this.config.playerid,
			roundId: randomstr(),
			amount: amount,
			currency: this.config.currency,
			gameId: this.config.gameid,
			device: this.config.device,
			clientType: this.config.clienttype,
			category: this.config.category,
			completed: completed,
			created: this.getDateTime()
		};

		return await this.__execute_rest('rollback', vars, customheaders, body, 'loginfailed');
	}

	async error_rollback_v2_login_failed(betid, roundid, completed = 'true') {
		const amount = parseFloat(this.config.amount);
		const jsonresponse = await this.success_withdrawal(amount, betid, roundid, randomstr());
		const referenceid = jsonresponse.referenceId;
		log(`Rollback reference id of ${referenceid} and amount of ${amount}`);
		const customheaders = {
			'Pass-Key': randomstr(),
			'Wallet-Session': this.config.walletsession
		};

		const vars = {
			referenceid: betid
		};

		const body = {
			betId: betid,
			txnId: randomstr(),
			playerId: this.config.playerid,
			roundId: roundid,
			amount: amount,
			currency: this.config.currency,
			gameId: this.config.gameid,
			device: this.config.device,
			clientType: this.config.clienttype,
			category: this.config.category,
			completed: completed,
			created: this.getDateTime()
		};

		return await this.__execute_rest('rollback_v2', vars, customheaders, body, 'loginfailed');
	}

	async error_rollback_transaction_not_found(roundid, completed = 'true') {
		log('Testing Rollback transaction not found');
		const amount = parseFloat(this.config.amount);
		const referenceid = randomstr();
		log(`Rollback reference id of ${referenceid} and amount of ${amount}`);
		const customheaders = {
			'Pass-Key': this.config.passkey,
			'Wallet-Session': this.config.walletsession
		};

		const vars = {
			referenceid: referenceid
		};

		const body = {
			txnId: randomstr(),
			playerId: this.config.playerid,
			roundId: randomstr(),
			amount: amount,
			currency: this.config.currency,
			gameId: this.config.gameid,
			device: this.config.device,
			clientType: this.config.clienttype,
			category: this.config.category,
			completed: completed,
			created: this.getDateTime()
		};

		const jsonresponse = await this.__execute_rest('rollback', vars, customheaders, body, null);
		this.checkrollback_transaction_not_found(jsonresponse);
		return jsonresponse;
	}

	async error_rollback_v2_transaction_not_found(roundid, completed = 'true') {
		const amount = parseFloat(this.config.amount);
		const betid = randomstr();
		const roundId = randomstr();
		const txnId = randomstr();

		log(`Rollback bet id of ${betid} and amount of ${amount} roundId: ${roundId} txnId: ${txnId}`);

		const customheaders = {
			'Pass-Key': this.config.passkey,
			'Wallet-Session': this.config.walletsession
		};

		const vars = {
			referenceid: betid
		};

		const body = {
			betId: betid,
			txnId: txnId,
			playerId: this.config.playerid,
			roundId: roundId,
			amount: amount,
			currency: this.config.currency,
			gameId: this.config.gameid,
			device: this.config.device,
			clientType: this.config.clienttype,
			category: this.config.category,
			completed: completed,
			created: this.getDateTime()
		};

		const jsonresponse = await this.__execute_rest('rollback_v2', vars, customheaders, body, null);
		this.checkrollback_transaction_not_found(jsonresponse);
		return jsonresponse;
	}

	async error_reward_login_failed() {
		log('Testing Reward login failed');
		return await this.reward(4, randomstr(), 0, {}, 'loginfailed');
	}

	async error_reward_request_declined() {
		log('Testing Reward request. A required field is missing.');
		const customheaders = {
			'Pass-Key': this.config.passkey
		};

		const body = {
			rewardTitle: 'Thunderkick Championship',
			txnId: randomstr(),
			playerId: this.config.playerid,
			amount: parseFloat(100),
			currency: this.config.currency,
			created: this.getDateTime()
		};

		return await this.__execute_rest('reward', {}, customheaders, body, 'requestdeclined');
	}
}

module.exports = {
	QTCW,
	convertToDecimal,
	verifyequalbalancereferenceid
};
