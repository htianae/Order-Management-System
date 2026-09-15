import assert from 'node:assert/strict'
import test from 'node:test'

type FormatterModule = {
  formatPendingPaymentRequest: (input: {
    type: 'PAYMENT' | 'SHIPPING'
    paymentPercent: string | null
    advancePaymentAmount: string
    arrivalPaymentAmount: string
  }) => string
}

async function loadFormatter() {
  try {
    return await import('./pendingPaymentRequest') as FormatterModule
  } catch {
    return {} as Partial<FormatterModule>
  }
}

test('formats a tail payment request', async () => {
  const formatter = await loadFormatter()
  assert.equal(typeof formatter.formatPendingPaymentRequest, 'function')
  assert.equal(formatter.formatPendingPaymentRequest!({
    type: 'PAYMENT',
    paymentPercent: '77.79',
    advancePaymentAmount: '0',
    arrivalPaymentAmount: '17760.23'
  }), 'CN¥17,760.23 (Balance 77.79%)')
})

test('formats advance and full payment requests', async () => {
  const formatter = await loadFormatter()
  assert.equal(typeof formatter.formatPendingPaymentRequest, 'function')
  assert.equal(formatter.formatPendingPaymentRequest!({
    type: 'PAYMENT',
    paymentPercent: '22.21',
    advancePaymentAmount: '5070.77',
    arrivalPaymentAmount: '0'
  }), 'CN¥5,070.77 (Advance 22.21%)')
  assert.equal(formatter.formatPendingPaymentRequest!({
    type: 'PAYMENT',
    paymentPercent: '100',
    advancePaymentAmount: '22831',
    arrivalPaymentAmount: '0'
  }), 'CN¥22,831.00 (Full Payment 100%)')
})

test('handles legacy split amounts and shipping approvals', async () => {
  const formatter = await loadFormatter()
  assert.equal(typeof formatter.formatPendingPaymentRequest, 'function')
  assert.equal(formatter.formatPendingPaymentRequest!({
    type: 'PAYMENT',
    paymentPercent: '70',
    advancePaymentAmount: '30600',
    arrivalPaymentAmount: '71400'
  }), 'CN¥102,000.00 (Payment 70%)')
  assert.equal(formatter.formatPendingPaymentRequest!({
    type: 'SHIPPING',
    paymentPercent: null,
    advancePaymentAmount: '0',
    arrivalPaymentAmount: '0'
  }), '-')
})
