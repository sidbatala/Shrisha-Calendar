// ============================================================
// contact.js – Contact form (Formspree) + FAQ + mobile menu
// ============================================================

(function () {
    'use strict';

    // ============================================================
    // CONFIG
    // ============================================================
    const FORM_ENDPOINT = 'https://formspree.io/f/mldbjvaa';

    const MAX_MESSAGE     = 1000;
    const STATUS_HIDE_MS  = 5000; // auto-hide success/error after 5s
    const EMAIL_RE        = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
    const PHONE_RE        = /^[+\d][\d\s\-()]{5,}$/;

    let statusHideTimer = null;

    // ============================================================
    // FORM VALIDATION & SUBMIT
    // ============================================================
    function initContactForm() {
        const form = document.getElementById('contact-form');
        if (!form) return;

        const submitBtn = document.getElementById('submit-btn');
        const msgEl     = document.getElementById('message');
        const charCount = document.getElementById('char-count');

        // Live character counter
        if (msgEl && charCount) {
            const update = () => {
                const len = msgEl.value.length;
                charCount.textContent = `${len} / ${MAX_MESSAGE}`;
                charCount.classList.toggle('warn', len > MAX_MESSAGE * 0.9);
            };
            msgEl.addEventListener('input', update);
            update();
        }

        // Clear error on input
        form.querySelectorAll('.form-input').forEach(input => {
            input.addEventListener('input', () => clearError(input));
            input.addEventListener('change', () => clearError(input));
        });

        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            hideStatus();

            const data = {
                name:    form.name.value.trim(),
                email:   form.email.value.trim(),
                phone:   form.phone.value.trim(),
                subject: form.subject.value,
                message: form.message.value.trim()
            };

            const errors = validate(data);
            if (Object.keys(errors).length) {
                Object.entries(errors).forEach(([field, msg]) => {
                    const el = form[field] || document.getElementById(field);
                    if (el) showError(el, msg, field);
                });
                const firstErr = form.querySelector('.has-error');
                if (firstErr) firstErr.scrollIntoView({ behavior: 'smooth', block: 'center' });
                return;
            }

            // Disable button while submitting
            submitBtn.disabled = true;
            submitBtn.innerHTML = '<i class="fas fa-circle-notch fa-spin"></i><span>Sending…</span>';

            const subjectLabels = {
                general:     'General Inquiry',
                feedback:    'Feedback / Suggestion',
                bug:         'Bug Report',
                partnership: 'Partnership',
                advertising: 'Advertising',
                other:       'Other'
            };
            const friendlySubject = subjectLabels[data.subject] || data.subject;

            try {
                const res = await fetch(FORM_ENDPOINT, {
                    method: 'POST',
                    headers: {
                        'Accept': 'application/json',
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        name:    data.name,
                        email:   data.email,
                        phone:   data.phone || '(not provided)',
                        subject: friendlySubject,
                        message: data.message,
                        _subject: `Shrisha Contact – ${friendlySubject} – ${data.name}`
                    })
                });

                let payload = {};
                try { payload = await res.json(); } catch { /* response may be empty */ }

                if (res.ok && !payload.errors) {
                    showStatus('success',
                        '<i class="fas fa-check-circle"></i> Thank you! Your message has been sent. We\'ll get back to you within 24 hours.');
                    form.reset();
                    if (charCount) charCount.textContent = `0 / ${MAX_MESSAGE}`;
                    clearErrorAll();
                } else {
                    const errMsg = (payload.errors && payload.errors.map(x => x.message).join(', '))
                                 || `Request failed (HTTP ${res.status})`;
                    console.error('Formspree error:', errMsg, payload);
                    showStatus('error',
                        '<i class="fas fa-exclamation-circle"></i> Could not send your message. Please try again or email us at sidbatala@gmail.com.');
                }
            } catch (err) {
                console.error('Contact form error:', err);
                showStatus('error',
                    '<i class="fas fa-exclamation-circle"></i> Network error. Please check your connection and try again.');
            } finally {
                submitBtn.disabled = false;
                submitBtn.innerHTML = '<i class="fas fa-paper-plane"></i><span>Send Message</span>';
            }
        });
    }

    function validate(data) {
        const errors = {};

        if (!data.name || data.name.length < 2) {
            errors.name = 'Please enter your full name (at least 2 characters).';
        }
        if (!data.email) {
            errors.email = 'Please enter your email address.';
        } else if (!EMAIL_RE.test(data.email)) {
            errors.email = 'Please enter a valid email address.';
        }
        if (data.phone && !PHONE_RE.test(data.phone)) {
            errors.phone = 'Please enter a valid phone number.';
        }
        if (!data.subject) {
            errors.subject = 'Please choose a topic.';
        }
        if (!data.message) {
            errors.message = 'Please write a message.';
        } else if (data.message.length < 10) {
            errors.message = 'Message should be at least 10 characters.';
        } else if (data.message.length > MAX_MESSAGE) {
            errors.message = `Message should not exceed ${MAX_MESSAGE} characters.`;
        }
        return errors;
    }

    function showError(inputEl, message, fieldName) {
        inputEl.classList.add('has-error');
        const errEl = document.querySelector(`.form-error[data-for="${fieldName}"]`);
        if (errEl) errEl.textContent = message;
    }

    function clearError(inputEl) {
        inputEl.classList.remove('has-error');
        const field = inputEl.id || inputEl.name;
        const errEl = document.querySelector(`.form-error[data-for="${field}"]`);
        if (errEl) errEl.textContent = '';
    }

    function clearErrorAll() {
        document.querySelectorAll('.has-error').forEach(el => el.classList.remove('has-error'));
        document.querySelectorAll('.form-error').forEach(el => el.textContent = '');
    }

    function showStatus(type, html) {
        const el = document.getElementById('form-status');
        if (!el) return;

        // clear any pending hide timer
        if (statusHideTimer) {
            clearTimeout(statusHideTimer);
            statusHideTimer = null;
        }

        el.className = 'form-status ' + type;
        el.innerHTML = html;

        // force reflow then add .visible so the transition plays
        void el.offsetWidth;
        el.classList.add('visible');

        // auto-hide after STATUS_HIDE_MS
        statusHideTimer = setTimeout(() => {
            el.classList.remove('visible');
            // After the fade-out transition ends, clear class + content
            setTimeout(() => {
                if (!el.classList.contains('visible')) {
                    el.className = 'form-status';
                    el.innerHTML = '';
                }
            }, 400);
            statusHideTimer = null;
        }, STATUS_HIDE_MS);
    }

    function hideStatus() {
        const el = document.getElementById('form-status');
        if (!el) return;
        if (statusHideTimer) {
            clearTimeout(statusHideTimer);
            statusHideTimer = null;
        }
        el.classList.remove('visible');
        el.className = 'form-status';
        el.innerHTML = '';
    }

    // ============================================================
    // FAQ ACCORDION
    // ============================================================
    function initFaq() {
        const list = document.getElementById('faq-list');
        if (!list) return;

        list.querySelectorAll('.faq-item').forEach(item => {
            const btn = item.querySelector('.faq-question');
            if (!btn) return;
            btn.addEventListener('click', () => {
                const isOpen = item.classList.contains('open');

                list.querySelectorAll('.faq-item').forEach(i => {
                    i.classList.remove('open');
                    const b = i.querySelector('.faq-question');
                    if (b) b.setAttribute('aria-expanded', 'false');
                });

                if (!isOpen) {
                    item.classList.add('open');
                    btn.setAttribute('aria-expanded', 'true');
                }
            });
        });
    }

    // ============================================================
    // MOBILE MENU
    // ============================================================
    function initMobileMenu() {
        const toggle = document.getElementById('mobile-menu-toggle');
        const menu = document.getElementById('nav-menu');
        if (!toggle || !menu) return;

        toggle.addEventListener('click', () => {
            toggle.classList.toggle('active');
            menu.classList.toggle('active');
        });
        document.querySelectorAll('.nav-link').forEach(link => {
            link.addEventListener('click', () => {
                toggle.classList.remove('active');
                menu.classList.remove('active');
            });
        });
    }

    // ============================================================
    // FOOTER YEAR
    // ============================================================
    function setYear() {
        const el = document.getElementById('current-year');
        if (el) el.textContent = new Date().getFullYear();
    }

    // ============================================================
    // INIT
    // ============================================================
    function init() {
        initMobileMenu();
        initContactForm();
        initFaq();
        setYear();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();