/*!
 * Copyright (c) 2022 Digital Bazaar, Inc. All rights reserved.
 */
import * as didKey from '@digitalbazaar/did-method-key';
import {constructOAuthHeader} from './oauth.js';
import {decodeSecretKeySeed} from 'bnid';
import {Ed25519Signature2020} from '@digitalbazaar/ed25519-signature-2020';
import {httpClient} from '@digitalbazaar/http-client';
import https from 'https';
import {ZcapClient} from '@digitalbazaar/ezcap';

const agent = new https.Agent({rejectUnauthorized: false});

const didKeyDriver = didKey.driver();

const defaultHeaders = {
  Accept: 'application/json, application/ld+json, */*'
};

const postHeaders = {
  'Content-Type': 'application/json',
  ...defaultHeaders
};

const _getZcapClient = async ({secretKeySeed}) => {
  const seed = await decodeSecretKeySeed({secretKeySeed});
  const didKey = await didKeyDriver.generate({seed});
  const {didDocument: {capabilityInvocation}} = didKey;
  return new ZcapClient({
    SuiteClass: Ed25519Signature2020,
    invocationSigner: didKey.keyPairs.get(capabilityInvocation[0]).signer(),
    agent
  });
};

export async function zcapRequest({
  endpoint,
  json,
  zcap,
  headers = defaultHeaders
}) {
  let result;
  let error;
  let capability = zcap.capability;
  const clientSecret = zcap.clientSecret;
  // we are storing the zcaps stringified right now
  if(typeof capability === 'string') {
    capability = JSON.parse(capability);
  }
  try {
    const zcapClient = await _getZcapClient({secretKeySeed: clientSecret});
    result = await zcapClient.write({
      url: endpoint,
      json,
      headers: {
        ...postHeaders,
        // passed in headers will overwrite postHeaders
        ...headers
      },
      capability
    });
  } catch(e) {
    error = e;
  }
  const {data, statusCode} = _getDataAndStatus({result, error});
  return {result, error, data, statusCode};
}

function _getDataAndStatus({result = {}, error = {}}) {
  let data = result.data || error.data;
  // FIXME remove this once VC-API returns from the issuer
  // are finalized.
  if(data && data.verifiableCredential) {
    data = data.verifiableCredential;
  }
  const statusCode = result.status || error.status;
  return {data, statusCode};
}

/**
 * Makes an https request.
 *
 * @param {object} options - Options to use.
 * @param {URL} options.url - A url.
 * @param {object} [options.json] - JSON for the request.
 * @param {object} [options.headers] - Headers for the request.
 * @param {string} options.method - The HTTP method for the request.
 * @param {object} [options.oauth2] - OAuth2 credentialss.
 * @param {object} [options.searchParams] - URL Queries for the request.
 *
 * @returns {object} The results from the request.
 */
export async function makeHttpsRequest({
  url,
  json,
  headers,
  method,
  oauth2,
  searchParams
}) {
  let result;
  let error;
  if(oauth2) {
    headers.Authorization = await constructOAuthHeader({...oauth2});
  }
  try {
    result = await httpClient(url, {
      method, json, headers, agent, searchParams
    });
  } catch(e) {
    error = e;
  }
  const {data, statusCode} = _getDataAndStatus({result, error});
  return {result, error, data, statusCode};
}
