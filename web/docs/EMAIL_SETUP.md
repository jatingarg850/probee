# Email Setup Guide

This document explains how to configure and use the email notification system for organization purchases.

## Overview

The application sends transactional emails using [Resend](https://resend.com) when:
- A user successfully purchases an organization plan
- Payment is verified and the organization is created

The email serves as:
- Payment confirmation
- Receipt for the transaction
- Quick access link to the new organization

## Setup Instructions

### 1. Get Resend API Key

1. Sign up at [resend.com](https://resend.com)
2. Verify your sending domain (or use the free testing domain for development)
3. Create an API key from the [API Keys page](https://resend.com/api-keys)

### 2. Configure Environment Variables

Add these variables to `web/.env`:

```bash
# Resend API Key (required for email functionality)
RESEND_API_KEY=re_xxxxxxxxxxxxx

# From Email Address (must be from verified domain)
FROM_EMAIL=noreply@yourdomain.com

# App URL (used in email links)
NEXT_PUBLIC_APP_URL=https://yourapp.com
```

### 3. Verify Domain (Production Only)

For production, you must verify your domain in Resend:

1. Go to [Domains](https://resend.com/domains) in Resend dashboard
2. Add your domain
3. Add the provided DNS records to your domain
4. Wait for verification (usually 24-48 hours)

For development, you can use Resend's testing domain: `onboarding@resend.dev`

## Email Template

The email includes:

### Header
- Celebratory greeting
- Success message

### Payment Details Section
- Organization name
- Plan type (Organization Activation)
- Purchase date and time
- Razorpay Payment ID
- Razorpay Order ID
- Total amount paid (formatted in INR)

### Next Steps Section
- Guidance on inviting team members
- Configuration tips
- Feature activation notice

### Call-to-Action Button
- Direct link to the newly created organization

### Footer
- Support contact information
- Professional branding

## Technical Details

### Architecture

```
POST /api/billing/verify
  ↓
1. Verify payment signature
2. Claim payment (atomic)
3. Create organization
4. Attach payment to org
5. Send confirmation email ← NEW
  ↓
Return success response
```

### Email Flow

1. **User data retrieval**: Fetches user's email and name from MongoDB
2. **Template generation**: Creates HTML email with payment details
3. **Resend API call**: Sends email via Resend
4. **Graceful failure**: Logs errors but doesn't fail the organization creation

### Key Features

- **Non-blocking**: Email failures don't prevent organization creation
- **Secure**: Uses HTML escaping to prevent XSS
- **Professional**: Modern, responsive HTML template
- **Informative**: Includes all transaction details
- **Localized**: Dates formatted in Indian Standard Time

### Files Involved

| File | Purpose |
|------|---------|
| `src/lib/email.ts` | Core email sending functionality using Resend |
| `src/lib/emailTemplates.ts` | HTML email template generation |
| `app/api/billing/verify/route.ts` | Integration point - sends email after org creation |

## Testing

### Development Testing

1. Use Resend's test mode or testing domain
2. Test emails appear in your Resend dashboard under [Emails](https://resend.com/emails)
3. Check the application logs for email send status:

```
Organization purchase email sent to user@example.com (Email ID: xxxxx)
```

### Test Scenarios

1. **Successful purchase**: Complete a test payment and verify email delivery
2. **Missing email config**: Remove `RESEND_API_KEY` and verify org creation still works
3. **Invalid email**: Ensure graceful handling of send failures
4. **User without email**: Test with user account that has no email field

## Customization

### Modify Email Template

Edit `src/lib/emailTemplates.ts`:

- Update branding colors in the gradient header
- Change email copy and structure
- Modify the call-to-action button text/link
- Adjust formatting and styling

### Change Email Subject

In `app/api/billing/verify/route.ts`, modify the subject line:

```typescript
const emailResult = await sendEmail({
  to: user.email,
  subject: 'Your Custom Subject Line',
  html: emailHtml,
})
```

### Add More Email Types

Create new template functions in `emailTemplates.ts`:

```typescript
export function generateWelcomeEmail(data: WelcomeEmailData): string {
  // Your template here
}
```

## Monitoring

### Check Email Logs

In application logs, look for:

```
✅ Success: Organization purchase email sent to user@example.com
❌ Error: Failed to send organization purchase email: [error details]
⚠️ Warning: User has no email address, skipping confirmation email
```

### Resend Dashboard

Monitor in [Resend Dashboard](https://resend.com/emails):
- Delivery status
- Open rates (if enabled)
- Click rates
- Bounce/spam reports

## Troubleshooting

### Email Not Sending

1. **Check API key**: Verify `RESEND_API_KEY` is set correctly
2. **Check domain**: Ensure `FROM_EMAIL` uses a verified domain
3. **Check logs**: Look for error messages in application logs
4. **Test Resend**: Try sending a test email from Resend dashboard

### Email Goes to Spam

1. Verify your domain with proper SPF/DKIM records
2. Use a professional FROM address
3. Avoid spam trigger words in subject/body
4. Warm up your sending domain gradually

### Template Not Rendering

1. Test HTML in [HTML Email Check](https://www.htmlemailcheck.com/)
2. Verify all variables are properly escaped
3. Check for unclosed HTML tags
4. Test in multiple email clients

## Security Considerations

- ✅ HTML content is escaped to prevent XSS
- ✅ Resend API key is server-side only (never exposed to client)
- ✅ Email sending failures don't leak sensitive information
- ✅ User email is validated before sending
- ✅ Transaction details come from verified payment, not user input

## Cost Considerations

Resend pricing (as of 2024):
- **Free tier**: 3,000 emails/month
- **Pro tier**: $20/month for 50,000 emails
- Pay as you go after limits

For most startups, the free tier is sufficient initially.

## Future Enhancements

Potential improvements:

1. **Email Templates**
   - Welcome emails for new users
   - Team member invitation emails
   - Payment failure notifications
   - Subscription renewal reminders

2. **Email Preferences**
   - User opt-out options
   - Notification preferences
   - Digest vs real-time options

3. **Analytics**
   - Track email open rates
   - Monitor click-through rates
   - A/B test subject lines

4. **Webhooks**
   - Handle Resend delivery webhooks
   - Update email status in database
   - Retry failed sends

## Support

For issues with:
- **Resend service**: Contact [Resend Support](https://resend.com/support)
- **Email template**: Check `src/lib/emailTemplates.ts`
- **Integration**: Check `app/api/billing/verify/route.ts`
- **Configuration**: Review this document and `.env.example`

## References

- [Resend Documentation](https://resend.com/docs)
- [Resend Node.js SDK](https://github.com/resendlabs/resend-node)
- [HTML Email Best Practices](https://www.emailonacid.com/blog/article/email-development/best-practices-html-email/)
