from __future__ import annotations

import logging
import smtplib
from email.message import EmailMessage

from app.core.config import settings

logger = logging.getLogger(__name__)


def send_reset_email(email: str, token: str) -> None:
    reset_link = f"{settings.FRONTEND_URL}/reset-password?token={token}"

    # Always log the link for debugging/testing purposes
    logger.info(f"Password reset link for {email}: {reset_link}")
    print(f"[PASSWORD RESET] Link for {email}: {reset_link}", flush=True)

    if not settings.SMTP_HOST:
        logger.warning("SMTP_HOST not configured, skipping email send")
        return

    msg = EmailMessage()
    msg["Subject"] = "Password reset"
    msg["From"] = settings.SMTP_USER
    msg["To"] = email
    msg.set_content(
        "Вы запросили восстановление пароля.\n\n"
        f"Перейдите по ссылке: {reset_link}\n\n"
        "Ссылка действует 1 час."
    )

    try:
        with smtplib.SMTP(settings.SMTP_HOST, settings.SMTP_PORT, timeout=20) as server:
            server.ehlo()
            server.starttls()
            server.ehlo()
            if settings.SMTP_USER:
                server.login(settings.SMTP_USER, settings.SMTP_PASS)
            server.sendmail(settings.SMTP_USER, [email], msg.as_string())
        logger.info(f"Password reset email sent successfully to {email}")
    except Exception as e:
        logger.error(f"Failed to send email to {email}: {e}")
        # Don't re-raise - we don't want to expose internal errors to the user
        # The user should still see "If the email exists..." message


def send_notification_email(
    email: str,
    *,
    subject: str,
    title: str,
    message: str,
    action_path: str = "/",
    action_url: str | None = None,
) -> None:
    """Send a platform notification email when SMTP is configured."""
    link = action_url or f"{settings.FRONTEND_URL.rstrip('/')}{action_path}"
    logger.info("Notification email for %s: %s — %s", email, title, link)

    if not settings.SMTP_HOST:
        logger.warning("SMTP_HOST not configured, skipping notification email to %s", email)
        return

    msg = EmailMessage()
    msg["Subject"] = subject
    msg["From"] = settings.SMTP_USER
    msg["To"] = email
    msg.set_content(
        f"{title}\n\n{message}\n\n"
        f"Открыть в MTUCI: {link}\n"
    )
    try:
        with smtplib.SMTP(settings.SMTP_HOST, settings.SMTP_PORT, timeout=20) as server:
            server.ehlo()
            server.starttls()
            server.ehlo()
            if settings.SMTP_USER:
                server.login(settings.SMTP_USER, settings.SMTP_PASS)
            server.sendmail(settings.SMTP_USER, [email], msg.as_string())
        logger.info("Notification email sent to %s", email)
    except Exception as e:
        logger.error("Failed to send notification email to %s: %s", email, e)
