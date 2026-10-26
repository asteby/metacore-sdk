/** Test data for the order screens: the demo orders of the SDK mock, as the API serves them. */
import { createStorefrontClient, type Order, type PendingPayment } from '@asteby/storefront'
import { createMockStorefront, MOCK_CUSTOMER_EMAIL } from '@asteby/storefront/mock'

export async function demo() {
  const mock = createMockStorefront()
  const base = createStorefrontClient({ baseUrl: 'https://mock.local/api/gw', token: 'sk_mock', fetch: mock.fetch })
  await base.customer.requestOtp({ email: MOCK_CUSTOMER_EMAIL })
  const session = await base.customer.createSession({ email: MOCK_CUSTOMER_EMAIL, code: mock.otpCode })
  const client = base.withCustomerToken(session.token)
  const list = await client.customer.orders({ first: 50 })
  const detail = async (id: string): Promise<Order> => (await client.customer.order(id))!
  const pending = (await client.customer.pendingPayments()).nodes as PendingPayment[]
  return { mock, client, list, detail, pending }
}
