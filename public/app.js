(() => {
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];

  // Afficher / masquer le mot de passe
  $$('[data-toggle-password]').forEach((btn) => {
    const input = document.getElementById(btn.dataset.togglePassword);
    btn.addEventListener('click', () => {
      const show = input.type === 'password';
      input.type = show ? 'text' : 'password';
      btn.textContent = show ? 'Masquer' : 'Afficher';
      btn.setAttribute('aria-pressed', String(show));
    });
  });

  // Jauge de robustesse + vérification de la confirmation
  const pw = document.querySelector('[data-strength-input]');
  if (pw) {
    const bar = document.querySelector('[data-strength-bar]');
    const label = document.querySelector('[data-strength-label]');
    const pw2 = document.getElementById('password2');
    const textes = ['Très faible', 'Faible', 'Moyen', 'Bon', 'Excellent'];
    const score = (v) => {
      let s = 0;
      if (v.length >= 8) s++;
      if (v.length >= 12) s++;
      if (/[a-z]/.test(v) && /[A-Z]/.test(v)) s++;
      if (/\d/.test(v) && /[^A-Za-z0-9]/.test(v)) s++;
      return v ? Math.max(s, 1) : 0;
    };
    const verifier = () => {
      if (pw2) pw2.setCustomValidity(pw2.value && pw2.value !== pw.value ? 'Les mots de passe ne correspondent pas.' : '');
    };
    pw.addEventListener('input', () => {
      const s = score(pw.value);
      bar.dataset.level = String(s);
      label.textContent = pw.value ? textes[s] : '\u00a0';
      verifier();
    });
    pw2?.addEventListener('input', verifier);
  }

  // Placeholder selon le profil (login)
  const ident = document.getElementById('identifiant');
  const radios = $$('input[name="profil"]');
  if (ident && radios.length) {
    const maj = () => {
      const perso = radios.find((r) => r.checked)?.value === 'personnel';
      ident.placeholder = perso ? 'agent1@univ-saloum.example' : 'SAL2600001 ou e-mail';
    };
    radios.forEach((r) => r.addEventListener('change', maj));
    maj();
  }

  // Anti double-envoi + spinner
  $$('form[data-loading]').forEach((form) => {
    form.addEventListener('submit', () => {
      if (!form.checkValidity()) return;
      const b = form.querySelector('button.submit');
      b.classList.add('loading');
      setTimeout(() => (b.disabled = true), 0);
    });
  });

  // Reflet « liquid glass » qui suit le pointeur
  $$('.card, .stat, .steps li, .hero, .top').forEach((el) => {
    el.addEventListener('pointermove', (e) => {
      const r = el.getBoundingClientRect();
      el.style.setProperty('--mx', `${e.clientX - r.left}px`);
      el.style.setProperty('--my', `${e.clientY - r.top}px`);
    });
  });

  // Effet ondulation sur les boutons
  $$('button:not(.link), .btn').forEach((b) => {
    b.addEventListener('pointerdown', (e) => {
      const r = b.getBoundingClientRect();
      const d = Math.max(r.width, r.height);
      const s = document.createElement('span');
      s.className = 'ripple';
      s.style.cssText = `width:${d}px;height:${d}px;left:${e.clientX - r.left - d / 2}px;top:${e.clientY - r.top - d / 2}px`;
      b.appendChild(s);
      s.addEventListener('animationend', () => s.remove());
    });
  });

  // En-tête plus opaque au défilement
  const top = document.querySelector('.top');
  if (top) {
    const maj = () => top.classList.toggle('scrolled', scrollY > 8);
    addEventListener('scroll', maj, { passive: true });
    maj();
  }

  // Apparition au scroll + compteurs animés
  const reduit = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const compter = (el) => {
    const cible = Number(el.dataset.count) || 0;
    if (reduit || cible === 0) { el.textContent = cible.toLocaleString('fr-FR'); return; }
    const debut = performance.now();
    const duree = 1200;
    const tick = (t) => {
      const p = Math.min(1, (t - debut) / duree);
      el.textContent = Math.round(cible * (1 - Math.pow(1 - p, 3))).toLocaleString('fr-FR');
      if (p < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  };
  const io = new IntersectionObserver((entries) => {
    entries.forEach((e) => {
      if (!e.isIntersecting) return;
      e.target.classList.add('in');
      $$('[data-count]', e.target).forEach(compter);
      io.unobserve(e.target);
    });
  }, { threshold: 0.2 });
  $$('.reveal').forEach((el, i) => { el.style.transitionDelay = `${(i % 4) * 90}ms`; io.observe(el); });
})();