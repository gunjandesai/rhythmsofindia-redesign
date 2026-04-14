document.addEventListener('DOMContentLoaded', () => {
    // Preloader
    const preloader = document.getElementById('preloader');
    window.addEventListener('load', () => setTimeout(() => preloader.classList.add('loaded'), 400));
    setTimeout(() => preloader.classList.add('loaded'), 3000);

    // Navbar
    const navbar = document.getElementById('navbar');
    const navLinks = document.querySelectorAll('.nav-link');
    const sections = document.querySelectorAll('section[id]');
    const isHome = window.location.pathname === '/' || window.location.pathname.endsWith('index.html');

    function handleScroll() {
        if (window.scrollY > 80) navbar.classList.add('scrolled');
        else if (isHome) navbar.classList.remove('scrolled');
        // Back to top
        const btn = document.getElementById('backToTop');
        if (btn) btn.classList.toggle('visible', window.scrollY > 500);
    }

    function updateActiveNavOnScroll() {
        if (!isHome) return;
        const scrollY = window.scrollY + 100;
        sections.forEach(sec => {
            const top = sec.offsetTop, h = sec.offsetHeight, id = sec.getAttribute('id');
            if (scrollY >= top && scrollY < top + h) {
                navLinks.forEach(l => {
                    l.classList.remove('active');
                    if (l.getAttribute('href') === '#' + id) l.classList.add('active');
                });
            }
        });
    }

    window.addEventListener('scroll', () => { handleScroll(); updateActiveNavOnScroll(); });

    // Mobile Nav
    const navToggle = document.getElementById('navToggle');
    const navMenu = document.getElementById('navMenu');
    if (navToggle && navMenu) {
        navToggle.addEventListener('click', () => { navToggle.classList.toggle('active'); navMenu.classList.toggle('active'); });
        navLinks.forEach(l => l.addEventListener('click', () => { navToggle.classList.remove('active'); navMenu.classList.remove('active'); }));
        document.addEventListener('click', e => { if (!navMenu.contains(e.target) && !navToggle.contains(e.target)) { navToggle.classList.remove('active'); navMenu.classList.remove('active'); }});
    }

    // Particles (home only)
    const pc = document.getElementById('heroParticles');
    if (pc) {
        for (let i = 0; i < 25; i++) {
            const p = document.createElement('div');
            p.classList.add('particle');
            p.style.left = Math.random() * 100 + '%';
            p.style.width = (Math.random() * 4 + 2) + 'px';
            p.style.height = p.style.width;
            p.style.animationDuration = (Math.random() * 10 + 8) + 's';
            p.style.animationDelay = (Math.random() * 10) + 's';
            pc.appendChild(p);
        }
    }

    // Scroll animations
    const animEls = document.querySelectorAll(
        '.schedule-card, .benefit-item, .instructor-detail-grid, .studio-detail, ' +
        '.news-card, .gallery-item, .section-header, .class-text-block, ' +
        '.advanced-content, .dance-school-content, .contact-form-wrapper, .contact-sidebar'
    );
    animEls.forEach((el, i) => { el.classList.add('fade-in'); el.style.transitionDelay = (i % 4) * .08 + 's'; });
    const obs = new IntersectionObserver(entries => entries.forEach(e => { if (e.isIntersecting) e.target.classList.add('visible'); }), { threshold: .1, rootMargin: '0px 0px -40px 0px' });
    animEls.forEach(el => obs.observe(el));

    // Lightbox
    const lightbox = document.getElementById('lightbox');
    const lightboxImg = document.getElementById('lightboxImg');
    const close = document.querySelector('.lightbox-close');
    document.querySelectorAll('.gallery-item').forEach(item => {
        item.addEventListener('click', () => {
            const img = item.querySelector('img');
            if (img && lightbox && lightboxImg) {
                lightboxImg.src = img.src; lightboxImg.alt = img.alt;
                lightbox.classList.add('active'); lightbox.setAttribute('aria-hidden', 'false');
                document.body.style.overflow = 'hidden';
            }
        });
    });
    function closeLB() { if (lightbox) { lightbox.classList.remove('active'); lightbox.setAttribute('aria-hidden', 'true'); document.body.style.overflow = ''; }}
    if (close) close.addEventListener('click', closeLB);
    if (lightbox) lightbox.addEventListener('click', e => { if (e.target === lightbox) closeLB(); });
    document.addEventListener('keydown', e => { if (e.key === 'Escape') closeLB(); });



    // Contact form
    const form = document.getElementById('contactForm');
    if (form) {
        form.addEventListener('submit', async e => {
            e.preventDefault();
            const n = document.getElementById('contactName').value.trim();
            const em = document.getElementById('contactEmail').value.trim();
            const subj = document.getElementById('contactSubject').value.trim();
            const msg = document.getElementById('contactMessage').value.trim();
            if (!n || !em || !msg) { alert('Please fill in all required fields.'); return; }
            if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(em)) { alert('Please enter a valid email.'); return; }

            // Get reCAPTCHA v3 token
            let recaptchaToken;
            try {
                recaptchaToken = await grecaptcha.execute('6Lf5T7EsAAAAAJG22pc5RVxI1lGYbHph9v7JY_tu', { action: 'contact' });
            } catch (err) {
                alert('reCAPTCHA verification failed. Please refresh and try again.');
                return;
            }

            const btn = form.querySelector('button[type="submit"]');
            const origText = btn.textContent;
            btn.textContent = 'Sending...';
            btn.disabled = true;

            try {
                const resp = await fetch('/api/contact', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ name: n, email: em, subject: subj, message: msg, recaptchaToken: recaptchaToken })
                });
                const data = await resp.json();
                if (data.success) {
                    alert('Thank you! Your message has been sent successfully.');
                    form.reset();
                } else {
                    alert(data.message || 'Failed to send message. Please try again.');
                }
            } catch (err) {
                alert('Network error. Please try again later.');
            } finally {
                btn.textContent = origText;
                btn.disabled = false;
            }
        });
    }

    // Back to top
    const btt = document.getElementById('backToTop');
    if (btt) btt.addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }));

    // Smooth scroll for anchors
    document.querySelectorAll('a[href^="#"]').forEach(a => {
        a.addEventListener('click', e => {
            const href = a.getAttribute('href');
            if (href === '#') { e.preventDefault(); window.scrollTo({ top: 0, behavior: 'smooth' }); return; }
            const target = document.querySelector(href);
            if (target) {
                e.preventDefault();
                const offset = navbar ? navbar.offsetHeight + 10 : 80;
                window.scrollTo({ top: target.getBoundingClientRect().top + window.scrollY - offset, behavior: 'smooth' });
            }
        });
    });

    // Auto-classify events as Upcoming or Past based on date
    document.querySelectorAll('.events-year-group[data-year]').forEach(group => {
        const cards = Array.from(group.querySelectorAll('.event-card[data-date]'));
        if (!cards.length) return;
        const today = new Date(); today.setHours(0, 0, 0, 0);
        const upcoming = cards.filter(c => new Date(c.dataset.date + 'T23:59:59') >= today);
        const past = cards.filter(c => new Date(c.dataset.date + 'T23:59:59') < today);
        upcoming.sort((a, b) => new Date(a.dataset.date) - new Date(b.dataset.date));
        past.sort((a, b) => new Date(b.dataset.date) - new Date(a.dataset.date));
        cards.forEach(c => c.remove());
        group.querySelectorAll('.events-sublabel').forEach(l => l.remove());
        const label = group.querySelector('.events-year-label');
        if (upcoming.length) {
            const h = document.createElement('h4');
            h.className = 'events-sublabel';
            h.innerHTML = '<i class="fas fa-calendar-alt"></i> Upcoming';
            label.after(h);
            upcoming.forEach(c => { c.classList.add('event-card-upcoming'); h.after(c); });
            // insert past after last upcoming
            if (past.length) {
                const hp = document.createElement('h4');
                hp.className = 'events-sublabel';
                hp.innerHTML = '<i class="fas fa-check-circle"></i> Past';
                upcoming[upcoming.length - 1].after(hp);
                past.forEach(c => { c.classList.remove('event-card-upcoming'); hp.after(c); });
            }
        } else if (past.length) {
            const hp = document.createElement('h4');
            hp.className = 'events-sublabel';
            hp.innerHTML = '<i class="fas fa-check-circle"></i> Past';
            label.after(hp);
            past.forEach(c => { c.classList.remove('event-card-upcoming'); hp.after(c); });
        }
    });
});
