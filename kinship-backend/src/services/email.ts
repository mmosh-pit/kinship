import sgMail from "@sendgrid/mail";

sgMail.setApiKey(process.env.SENDGRID_API_KEY!);

const FROM = { email: "security@kinship.systems", name: "Kinship Bots" };

export async function sendVerificationCode(to: string, code: number) {
  await sgMail.send({
    from: FROM,
    to,
    subject: "Verification Code",
    html: `Hey there!<br /> Here's your code to verify your Email and finish your registration into Kinship Bots!<br /> <strong>${code}</strong>`,
  });
}

export async function sendForgotPasswordCode(to: string, code: number) {
  await sgMail.send({
    from: FROM,
    to,
    subject: "Verification Code",
    html: `Hey there!<br /> Here's your code to Reset your password!<br /> <strong>${code}</strong>`,
  });
}

export async function sendWalletKeypair(to: string, keypair: string) {
  await sgMail.send({
    from: FROM,
    to,
    subject: "Kinship Wallet Key Pair",
    html: `Here's your Kinship wallet keypair, save it in a safe place in case you need to recover your Kinship Wallet<br /><br /> <strong>${keypair}</strong>`,
  });
}

export async function sendAccountDeletionNotification(
  userEmail: string,
  reason: string
) {
  const html = `Hey there!<br /> Someone requested to delete their account, please checkout database to see the following record<br /> <strong>${userEmail}</strong> <br/ > The reason is: ${reason}`;
  const subject = "Account Deletion Request";

  await Promise.all([
    sgMail.send({ from: FROM, to: "elias.ramirez@kinship.systems", subject, html }),
    sgMail.send({ from: FROM, to: "david.levine@kinship.systems", subject, html }),
  ]);
}
