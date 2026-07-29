import test from 'node:test'
import assert from 'node:assert/strict'
import { isDuplicateMonnifyReferenceError, buildMonnifyReference } from './monnify-reference-utils.js'

test('detects Monnify duplicate reference errors', () => {
  const error = new Error('Monnify disbursement failed: {"responseMessage":"Supplied reference already exists!","responseCode":"D05"}')
  assert.equal(isDuplicateMonnifyReferenceError(error), true)
})

test('builds a fresh reference for retries', () => {
  const base = 'withdrawal-123'
  const retryReference = buildMonnifyReference(base, 2)
  assert.match(retryReference, /^withdrawal-123-/)
  assert.notEqual(retryReference, base)
})
