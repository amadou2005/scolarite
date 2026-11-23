// Variables de vues, messages flash, protection CSRF légère.
function locals(req, res, next) {
  req.flash = (type, msg) => {
    req.session.flash = { type, msg };
  };
  res.locals.user = req.session.user || null;
  res.locals.flash = req.session.flash || null;
  res.locals.titre = '';
  res.locals.erreurs = [];
  res.locals.form = {};
  delete req.session.flash;
  next();
}

function sameOrigin(req, res, next) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();

  const refuser = () =>
    res.status(403).render('erreur', { titre: 'Refusé', message: 'Requête inter-site refusée.' });

  // 1) Navigateurs modernes : Sec-Fetch-Site fait foi
  const site = req.get('sec-fetch-site');
  if (site) {
    if (site === 'same-origin' || site === 'none') return next();
    console.warn(`CSRF refusé : Sec-Fetch-Site=${site} Origin=${req.get('origin')} Host=${req.get('host')}`);
    return refuser();
  }

  // 2) Repli : comparaison Origin / Host
  const origin = req.get('origin');
  if (!origin) return next();
  try {
    if (new URL(origin).host === req.host) return next();
  } catch {
    /* Origin invalide */
  }
  console.warn(`CSRF refusé : Origin=${origin} Host=${req.host}`);
  return refuser();
}

module.exports = { locals, sameOrigin };