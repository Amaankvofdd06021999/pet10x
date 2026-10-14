/**
 * What the co-manager invite toast says. An existing account is linked
 * straight away and no invite link exists, so "Invite sent" would be false;
 * and "We emailed them" is only said when a send actually succeeded.
 */
export interface InviteMessage {
  title: string
  description: string
  /** Set when nobody was emailed the link, so the screen offers "Copy link". */
  inviteUrl?: string
}

export function inviteResultMessage(opts: {
  email: string
  building: string
  existingAccount: boolean
  emailSent: boolean
  inviteUrl?: string
  emailFailed?: boolean
}): InviteMessage {
  if (opts.existingAccount) {
    return {
      title: "Co-manager added",
      description:
        `${opts.email} already had a Pet10x account and can now manage ${opts.building}.` +
        (opts.emailSent ? " We emailed them." : ""),
    }
  }
  if (!opts.emailSent && opts.inviteUrl) {
    return opts.emailFailed
      ? {
          title: "Manager added — the email failed",
          description: "The invite email could not be sent. Copy the invite link to share it.",
          inviteUrl: opts.inviteUrl,
        }
      : {
          title: "Manager added — email not sent",
          description: "Email is disabled outside production. Copy the invite link to share it.",
          inviteUrl: opts.inviteUrl,
        }
  }
  return { title: "Co-manager invited", description: `Invite sent to ${opts.email}` }
}
