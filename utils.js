const fs = require('fs');
const path = require('path');
const axios = require('axios');

/**
 * Log a message with timestamp
 * @param {string} msg - Message to log
 */
function log(msg) {
  const now = new Date();
  console.log(`${now.toISOString()}\t${msg}`);
}

/**
 * Log an error and exit
 * @param {string} msg - Error message
 */
function error(msg) {
  log(`ERROR: ${msg}`);
  process.exit(1);
}

/**
 * Log a warning
 * @param {string} msg - Warning message
 */
function warning(msg) {
  log(`WARNING: ${msg}`);
}

/**
 * Generate a random string
 * @param {number} length - Length of random string (default: 12)
 * @returns {string} Random uppercase string
 */
function randomstr(length = 12) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

/**
 * Configuration class for loading wallet settings
 */
class Config {
  constructor(filename) {
    if (!fs.existsSync(filename)) {
      error(`Config file '${filename}' not found`);
    }

    const content = fs.readFileSync(filename, 'utf-8');
    this.parseConfig(content);
    this.error = false;
    this.warning = false;
    this.resend = false;
  }

  parseConfig(content) {
    const lines = content.split('\n');
    let currentSection = null;

    for (const line of lines) {
      const trimmed = line.trim();
      
      // Skip comments and empty lines
      if (trimmed.startsWith('#') || trimmed.startsWith(';') || trimmed === '') {
        continue;
      }

      // Check for section header
      if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
        currentSection = trimmed.slice(1, -1);
        continue;
      }

      // Parse key-value pairs
      if (currentSection === 'wallet' && trimmed.includes('=')) {
        const [key, ...valueParts] = trimmed.split('=');
        const value = valueParts.join('=').trim();
        this[key.trim()] = value;
      }
    }

    // Convert numeric and boolean values
    if (this.amount) this.amount = parseFloat(this.amount);
    if (this.amounttoreachinsufficientfund) {
      this.amounttoreachinsufficientfund = parseFloat(this.amounttoreachinsufficientfund);
    }
    if (this.verifybalanceondeposit) {
      this.verifybalanceondeposit = parseInt(this.verifybalanceondeposit);
    }
    if (this.completed) {
      this.completed = this.completed.toLowerCase() === 'true' ? 'true' : 'false';
    }
  }
}

/**
 * Make an HTTP request
 * @param {string} url - Request URL
 * @param {object} customHeaders - Custom headers
 * @param {object} payload - Request body
 * @returns {Promise<object>} Response object with status and data
 */
async function doRequest(url, customHeaders, payload) {
  const headers = {
    'Accept': 'application/json',
    'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/89.0.4389.90 Safari/537.36',
    ...customHeaders
  };

  const config = {
    method: Object.keys(payload).length > 0 ? 'POST' : 'GET',
    url: url,
    headers: headers,
    validateStatus: () => true // Don't throw on any status
  };

  if (Object.keys(payload).length > 0) {
    config.data = payload;
    config.headers['Content-Type'] = 'application/json';
  }

  // Enable debug mode if CW_DEBUG environment variable is set
  if (process.env.CW_DEBUG) {
    console.log('\n=== REQUEST ===');
    console.log('URL:', url);
    console.log('Method:', config.method);
    console.log('Headers:', JSON.stringify(headers, null, 2));
    if (config.data) {
      console.log('Body:', JSON.stringify(config.data, null, 2));
    }
  }

  try {
    const response = await axios(config);
    
    if (process.env.CW_DEBUG) {
      console.log('\n=== RESPONSE ===');
      console.log('Status:', response.status);
      console.log('Headers:', JSON.stringify(response.headers, null, 2));
      console.log('Body:', JSON.stringify(response.data, null, 2));
      console.log('===============\n');
    }

    return {
      status: response.status,
      headers: response.headers,
      data: response.data
    };
  } catch (err) {
    error(`Failed to connect to: ${url} - ${err.message}`);
  }
}

module.exports = {
  log,
  error,
  warning,
  randomstr,
  Config,
  doRequest
};
