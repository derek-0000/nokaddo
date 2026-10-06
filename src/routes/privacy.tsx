import { createFileRoute } from '@tanstack/react-router'
import LegalPage from '#/components/views/legal-page'

export const Route = createFileRoute('/privacy')({
  head: () => ({ meta: [{ title: 'Privacy Policy · Nokaddo' }] }),
  component: PrivacyPolicy,
})

function PrivacyPolicy() {
  return (
    <LegalPage title="Privacy Policy">
      <p>
        Nokaddo does not store or track any personally identifiable information.
      </p>
      <p>
        We store only your Notion workspace ID and user ID in a Cloudflare KV
        database, and use them solely to operate the app.
      </p>
      <p>
        The server also keeps a session identifier to manage your sign-in and
        sign-out state.
      </p>
    </LegalPage>
  )
}
