import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { CONFIRM_SIGNUP_SUBJECT, confirmSignupTemplateHtml } from './email.ts'

// The dashboard copy of the "Confirm signup" email is pasted from this file.
// Regenerate after changing confirmSignupTemplateHtml:
//   UPDATE_AUTH_TEMPLATES=1 npx vitest run auth-templates
const templatePath = resolve(process.cwd(), 'supabase/templates/confirm-signup.html')

describe('Confirm signup template', () => {
  const html = confirmSignupTemplateHtml()

  it('matches supabase/templates/confirm-signup.html', () => {
    if (process.env.UPDATE_AUTH_TEMPLATES === '1' || !existsSync(templatePath)) {
      writeFileSync(templatePath, `${html}\n`)
    }
    expect(readFileSync(templatePath, 'utf8')).toBe(`${html}\n`)
  })

  it('gives both the code and the link, in the branded frame', () => {
    expect(html.match(/\{\{ \.Token \}\}/g)).toHaveLength(2) // the code and the inbox preview
    expect(html).toContain('href="{{ .ConfirmationURL }}"')
    expect(html).toContain('href="{{ .SiteURL }}/terms"')
    expect(html).toContain('href="https://www.instagram.com/trykaisg/"')
    expect(html).toContain('href="https://www.tiktok.com/@trykaisg"')
    expect(html).toContain('Confirm your email')
    expect(html).toContain('https://trykai.sg/trykai.png')
    expect(html).not.toMatch(/—/)
  })

  it('puts the code in the subject so it shows in the notification', () => {
    expect(CONFIRM_SIGNUP_SUBJECT).toBe('Your TryKai code: {{ .Token }}')
  })
})
