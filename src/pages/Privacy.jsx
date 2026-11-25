import LegalPage from '@/components/site/LegalPage';
import LegalReviewNote from '@/components/site/LegalReviewNote';

function Clause({ heading, children }) {
  return (
    <section>
      <h2 className="font-heading text-lg font-semibold text-white sm:text-xl">{heading}</h2>
      <div className="mt-3 space-y-3 text-sm leading-relaxed text-slate-400 sm:text-[0.95rem]">
        {children}
      </div>
    </section>
  );
}

export default function Privacy() {
  return (
    <LegalPage
      title="Privacy Policy"
      updated="25 November 2026"
      intro="This policy explains what Coinexa.net collects, why, and the choices you have. It describes the service as it operates today; anything that needs legal confirmation is marked as such rather than assumed."
    >
      <Clause heading="Who we are">
        <p>
          Coinexa.net (“Coinexa”, “we”) operates this website and the AI agent platform available
          through it. For privacy questions or requests, contact us at hello@coinexa.net.
        </p>
        <LegalReviewNote>
          the registered legal entity name, company number, registered address and the formal
          privacy contact (and whether a Data Protection Officer must be appointed) are not stated
          on this page because they are not confirmed.
        </LegalReviewNote>
      </Clause>

      <Clause heading="What we collect">
        <p>
          <span className="text-slate-200">Enquiries.</span> When you send the contact form we
          store your name, email address, the service you selected, your project description, a
          short reference code and the time of submission. We use it to reply to you and to keep a
          record of the request.
        </p>
        <p>
          <span className="text-slate-200">Accounts and workspaces.</span> When you create an
          account we store your email address, your display name, your account role and your
          workspace memberships. Authentication is handled by our hosting provider; we do not
          store your password in readable form. If you turn on two-step sign-in, we store the
          authenticator factor needed to check your codes, never the codes themselves.
        </p>
        <p>
          <span className="text-slate-200">Candidates (Recruitment Agent).</span> Workspaces that
          use the Recruitment Agent store candidate data on their behalf: name, contact details,
          location, skills and experience, CVs they upload or receive, written interview answers,
          evaluation scores and reports, and the consent choices each candidate made (with the
          wording version and time). For this data the hiring workspace decides what is collected
          and why; we process it for them. Candidates who apply through a public job page give
          their consent on that page and can see and withdraw it through their personal link.
        </p>
        <p>
          <span className="text-slate-200">Network scans (Cyber Security Scan Agent).</span> When
          you run the Windows scanner, it records the devices it finds on your private network
          (local addresses, hardware vendor, open ports and services, and the scan time) and
          uploads that result to your workspace. It does not scan public internet addresses and
          does not collect file contents, browsing history or passwords.
        </p>
        <p>
          <span className="text-slate-200">Agent content.</span> When you build or run an agent we
          store the agent's configuration, the instructions you submit, uploaded files, the results
          produced, step-by-step execution logs, warnings, and any human approval decisions
          (including who decided, when, and the note they left). Uploaded files are stored in
          private storage and are served only through short-lived signed links.
        </p>
        <p>
          <span className="text-slate-200">Operational records.</span> We keep metered usage
          records for each agent (tasks, scans, replies or documents used in the billing period,
          and the AI cost of that use) so that plan allowances and cost limits can be applied, and
          an audit log of workspace actions such as invitations, runs, hires and approvals.
        </p>
        <p>
          <span className="text-slate-200">Payments.</span> Agents are hired individually and billed
          through Stripe. Card details are entered on Stripe's checkout and are never received or
          stored by us. We receive the subscription, the agents it covers, their billing periods and
          payment status. Payments are currently in test mode; no live charge is taken.
        </p>
      </Clause>

      <Clause heading="How AI processing works">
        <p>
          To execute an agent task, the instruction you submit, the relevant agent configuration
          and the contents of files you attach (for the Recruitment Agent, the candidate profiles,
          CVs and interview answers being evaluated) are sent to our AI model provider, Anthropic,
          so that a response can be generated. The
          result, along with a record of each step, is returned and stored in your workspace.
        </p>
        <p>
          Do not submit content you are not entitled to process, or that you would not want
          transmitted to a model provider for that purpose. Research features also retrieve
          information from public web pages, and the pages consulted are listed in the report.
        </p>
        <LegalReviewNote>
          the model provider's processing locations, the applicable data-processing
          terms and any international transfer safeguards must be confirmed before this section can
          be treated as a complete disclosure.
        </LegalReviewNote>
      </Clause>

      <Clause heading="Third-party services">
        <p>
          We rely on the following providers to run the service: Supabase (database,
          authentication, file storage and server functions), Hostinger (website hosting),
          Anthropic (AI model processing), Stripe (payments), Resend (account and recruitment
          emails), Cloudflare Turnstile (a security check on sign-up, sign-in and job applications
          that tells people from automated abuse), Google Fonts (typeface delivery), and — only if
          you choose it — Google as a sign-in method.
        </p>
      </Clause>

      <Clause heading="Cookies and local storage">
        <p>
          This site sets no advertising cookies and no cross-site tracking pixels. The only
          browser storage we use is what is required to sign you in and keep your session valid,
          plus your own interface preferences. On forms protected by Cloudflare Turnstile,
          Cloudflare processes technical signals from your browser to run the security check. You can clear it at any time from your browser.
        </p>
      </Clause>

      <Clause heading="How long we keep data">
        <p>
          Enquiry records are kept until the request is resolved. Workspace content, execution
          history and usage records are kept for as long as the workspace is active, because the
          history is part of the service you are paying for. You can ask us to delete your account
          and workspace content at any time.
        </p>
        <LegalReviewNote>
          fixed retention periods, and the period applied after account closure or for billing and
          tax records, must be set with legal and accounting advice.
        </LegalReviewNote>
      </Clause>

      <Clause heading="Your choices and rights">
        <p>
          You can ask to see, correct or delete the personal data we hold about you, and object to
          a particular use. Write to hello@coinexa.net and we will respond. If you are a member of a
          workspace, some requests must be made through that workspace's administrator, because the
          workspace controls the content.
        </p>
        <LegalReviewNote>
          the specific statutory rights available to you, and the complaint route to a supervisory
          authority, depend on your jurisdiction and must be confirmed.
        </LegalReviewNote>
      </Clause>

      <Clause heading="Security">
        <p>
          Access to workspace records is enforced on the server through membership rules, not in
          the browser. Credentials for third-party services are held server-side and are never sent
          to the browser. Uploaded files are stored privately. Two-step sign-in with an
          authenticator app is available to every account and required for platform
          administrators. No system is perfectly secure, so please use a unique password, turn on
          two-step sign-in and limit who can administer your workspace.
        </p>
      </Clause>

      <Clause heading="Children">
        <p>The service is intended for business use and is not offered to anyone under 18.</p>
      </Clause>

      <Clause heading="Changes to this policy">
        <p>
          If our practices change we will update this page and revise the date above. Material
          changes affecting how we use your content will be announced in the product.
        </p>
      </Clause>
    </LegalPage>
  );
}