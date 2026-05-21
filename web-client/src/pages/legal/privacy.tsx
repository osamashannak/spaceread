import {Helmet} from "@dr.pogodin/react-helmet";
import {LegalMarkdownDocument, LegalPage} from "./legal_page.tsx";

const privacyPolicy = `
# Information We Collect
SpaceRead, formerly known as UAEU Space, is a student-led platform for sharing course materials, professor reviews, replies, ratings, and feedback. This Privacy Policy explains what information we collect, how we use it, when we share it, and the choices you have.

SpaceRead is not affiliated with United Arab Emirates University. If you do not agree with this Privacy Policy, please do not use SpaceRead.

We collect information in the following ways:
- Content you submit, including course files, file names, professor reviews, ratings, replies, reports, GIF links, review attachments, survey answers, and feedback.
- Contact or verification information you choose to provide, such as a university email address used to send a student verification code.
- Account information if account features are available and you choose to use them, such as a username, email address, password credentials, or Google sign-in information.
- Technical information collected automatically, including IP address, user agent, browser and device information, approximate usage data, pages viewed, actions taken, timestamps, cookies, session identifiers, and error or performance data.
- File metadata, including size, type, upload time, storage identifier, download count, and safety or moderation status.

# Cookies, Local Storage, and Sessions
SpaceRead uses cookies and similar technologies to create and recognize a browser session, prevent duplicate reviews or ratings, support deletion from the same session, protect against abuse, and keep the website working. Session cookies may last for an extended period unless you clear them from your browser.

SpaceRead may also use browser local storage or session storage for interface state, feedback prompts, and student verification status. For example, your browser may temporarily store a pending verification email address or whether a feedback prompt has already been shown.

# How We Use Information
We use information to:
- Operate, maintain, and improve SpaceRead.
- Publish and organize course materials, reviews, replies, ratings, and feedback.
- Prevent spam, fraud, abuse, duplicate submissions, and security incidents.
- Moderate content, detect unsafe or inappropriate submissions, and respond to reports.
- Send student verification emails and confirm verification status when you request it.
- Analyze usage patterns, diagnose errors, measure performance, and improve features.
- Generate download links, protect file access, and count course file downloads.
- Comply with legal obligations and enforce our Terms of Service.

# Public Content
Course materials, file names, reviews, replies, ratings summaries, attachments, GIFs, and related metadata may be visible to other users. Please do not submit private or sensitive information about yourself or anyone else. Even when a review appears anonymous publicly, SpaceRead may keep internal session, IP address, moderation, and security records connected to the submission.

# Third-Party Services
We use third-party services to provide, protect, and improve SpaceRead. Depending on the feature you use, information may be processed by providers such as:
- Microsoft Clarity for usage analytics and product improvement.
- Sentry for error monitoring and performance diagnostics.
- Google reCAPTCHA Enterprise for spam and abuse prevention.
- Google Perspective API for review safety and moderation signals.
- Google Cloud Translation for translating reviews.
- Tenor or GIF providers when you search for or embed GIFs.
- Microsoft Azure services for file storage and image safety checks.
- Amazon Web Services, including email delivery services for verification emails.
- Security or malware scanning providers when files need safety review.

These providers may process information under their own privacy policies. We try to share only the information needed for the feature, security check, analytics event, or operational purpose.

# When We Share Information
We may share information:
- With service providers that help operate, secure, moderate, analyze, or maintain SpaceRead.
- When content is public by nature, such as published reviews, replies, and uploaded materials.
- When required by law, legal process, court order, or a valid government request.
- To investigate, prevent, or address abuse, security issues, rights violations, or harm.
- In connection with a reorganization, transfer, or continuation of the SpaceRead service.

We do not sell your personal information.

# Data Retention
We keep information for as long as needed to operate SpaceRead, provide public content, maintain security, resolve disputes, enforce our Terms, comply with legal obligations, and improve the service. Public content may remain available until it is removed, hidden, or deleted. Security, session, analytics, moderation, file access, and backup records may be kept after public content is removed when reasonably necessary.

Verification emails are used to send and check a code. Your browser may temporarily store pending verification details so the verification flow works. You can clear browser storage or contact us if you need help with privacy-related requests.

# Your Choices and Rights
You can choose not to submit content, not to use optional verification or account features, and not to upload files or attachments. You can also clear cookies, local storage, and session storage in your browser, although doing so may remove your ability to delete content from the same session or may reset verification and interface state.

Depending on applicable law, you may have rights to request access, correction, deletion, restriction, objection, or a copy of personal information associated with you. Because many SpaceRead features are session-based and public submissions may not include a direct identity, we may need information from you to verify that a request relates to your data.

# Security
We use reasonable technical and organizational measures to protect information, including secure cookies for sessions, moderation tools, file storage controls, and security checks. No website, transmission, or storage system is completely secure, so we cannot guarantee absolute security.

# International Processing
SpaceRead and its service providers may process and store information in the United Arab Emirates, the European Union, the United States, or other locations where providers operate. By using SpaceRead, you understand that information may be transferred and processed outside your country of residence.

# Children's Privacy
SpaceRead is not directed to children under 17, and we do not knowingly collect personal information from children under 17. If you believe a child has submitted personal information to SpaceRead, contact us and we will take reasonable steps to review and remove it.

# Changes to This Policy
We may update this Privacy Policy as SpaceRead changes or as legal, security, or operational needs evolve. The updated policy will be posted on this page with a new "Last updated" date. Your continued use of SpaceRead after an update means you accept the revised policy.

# Contact
Privacy questions, requests, and concerns may be sent to contact@spaceread.net.
`;

export default function Privacy() {
    return (
        <>
            <Helmet>
                <title>Privacy Policy - SpaceRead</title>
            </Helmet>
            <LegalPage
                title="Privacy Policy"
                label="SpaceRead"
                lastUpdated="May 21, 2026"
                notice="This policy explains how SpaceRead handles information submitted through the website and information collected to keep the platform useful, secure, and respectful."
            >
                <LegalMarkdownDocument source={privacyPolicy}/>
            </LegalPage>
        </>
    );
}
