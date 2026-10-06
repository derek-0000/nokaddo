import { createFileRoute } from '@tanstack/react-router'
import LegalPage from '#/components/views/legal-page'

export const Route = createFileRoute('/terms')({
  head: () => ({ meta: [{ title: 'Terms of Use · Nokaddo' }] }),
  component: TermsOfUse,
})

function TermsOfUse() {
  return (
    <LegalPage title="Terms of Use">
      <p>
        Nokaddo only modifies the data you grant it access to. Accordingly,
        Nokaddo shall not be held liable for any unexpected creation,
        modification, or deletion of data.
      </p>
      <p>
        Sponsoring the project does not grant sponsors any influence over
        feature development or any right to request work from the development
        team.
      </p>
      <p>
        By using Nokaddo, you accept these terms. If you do not agree with them,
        you must not use Nokaddo.
      </p>
    </LegalPage>
  )
}
