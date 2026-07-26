/**
 * Outbound email, currently via Resend.
 *
 * When RESEND_API_KEY isn't set, messages are logged to the server console
 * instead of being sent. That keeps local development working without an
 * account, and means a misconfigured production deploy degrades to "codes
 * don't arrive" rather than throwing 500s at parents mid-signup.
 */

const RESEND_ENDPOINT = "https://api.resend.com/emails";

export type Mail = {
  to: string;
  subject: string;
  text: string;
};

export function emailConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY && process.env.EMAIL_FROM);
}

export async function sendEmail(mail: Mail): Promise<{ sent: boolean }> {
  if (!emailConfigured()) {
    console.warn(
      `[email] not configured — would have sent to ${mail.to}: ${mail.subject}\n${mail.text}`
    );
    return { sent: false };
  }

  try {
    const res = await fetch(RESEND_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: process.env.EMAIL_FROM,
        to: [mail.to],
        subject: mail.subject,
        text: mail.text,
      }),
    });
    if (!res.ok) {
      console.error(`[email] send failed (${res.status}): ${await res.text()}`);
      return { sent: false };
    }
    return { sent: true };
  } catch (err) {
    console.error("[email] send threw:", err);
    return { sent: false };
  }
}

const school = () => process.env.NEXT_PUBLIC_SCHOOL_NAME || "School Canteen";

export function verificationEmail(code: string, name: string): Omit<Mail, "to"> {
  return {
    subject: `${code} is your ${school()} confirmation code`,
    text: `Hi ${name},

Your email confirmation code is:

    ${code}

Enter it on the canteen site to finish setting up your account. The code
expires in 15 minutes.

If you didn't create a canteen account, you can ignore this email.

— ${school()}`,
  };
}

export function passwordResetEmail(code: string, name: string): Omit<Mail, "to"> {
  return {
    subject: `${code} is your ${school()} password reset code`,
    text: `Hi ${name},

Someone asked to reset the password for your canteen account. Your reset
code is:

    ${code}

The code expires in 15 minutes and can only be used once.

If this wasn't you, ignore this email — your password hasn't changed.

— ${school()}`,
  };
}
