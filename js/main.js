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
        form.addEventListener('submit', e => {
            e.preventDefault();
            const n = document.getElementById('contactName').value.trim();
            const em = document.getElementById('contactEmail').value.trim();
            const msg = document.getElementById('contactMessage').value.trim();
            if (!n || !em || !msg) { alert('Please fill in all required fields.'); return; }
            if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(em)) { alert('Please enter a valid email.'); return; }
            alert('Thank you for your message! We will get back to you soon.');
            form.reset();
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
});
