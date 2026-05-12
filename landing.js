const navToggle = document.getElementById('nav-toggle');
  const navLinks = document.getElementById('nav-links');
  const navBottomRow = document.getElementById('nav-bottom-row');
  const bagImage = document.getElementById('display-bag');
  const pouchZones = Array.from(document.querySelectorAll('.pouch-zone'));

  const bagBaseSrc = 'images/landing-bag/go bag.png';
  
  // GIF animation config: separate open and close GIFs, plus timing for when to show them
  const pouchAnimationMap = {
    top: {
      openGif: 'images/landing-bag/Go Bag Top Pouch.gif',
      closeGif: 'images/landing-bag/Go Bag Top Pouch Close.gif',
      openStatePng: 'images/landing-bag/Go Bag Top Pouch Open.png',
      openDuration: 800,
      closeStartMs: 1400,
      closeDuration: 1800
    },
    middle: {
      openGif: 'images/landing-bag/Go Bag Middle Pouch.gif',
      closeGif: 'images/landing-bag/Go Bag Middle Pouch Close.gif',
      openStatePng: 'images/landing-bag/Go Bag Middle Pouch Open.png',
      openDuration: 1100,
      closeStartMs: 1100,
      closeDuration: 1100
    },
    bottom: {
      openGif: 'images/landing-bag/Go Bag Bottom Pouch.gif',
      closeGif: 'images/landing-bag/Go Bag Bottom Pouch Close.gif',
      openStatePng: 'images/landing-bag/Go Bag Bottom Pouch Open.png',
      openDuration: 200,
      closeStartMs: 200,
      closeDuration: 200
    },
    side: {
      openGif: 'images/landing-bag/Go Bag Side Pouch.gif',
      closeGif: 'images/landing-bag/Go Bag Side Pouch Close.gif',
      openStatePng: 'images/landing-bag/Go Bag Side Pouch Open.png',
      openDuration: 200,
      closeStartMs: 200,
      closeDuration: 200
    },
    'side-2': {
      openGif: 'images/landing-bag/Go Bag Side Pouch.gif',
      closeGif: 'images/landing-bag/Go Bag Side Pouch Close.gif',
      openStatePng: 'images/landing-bag/Go Bag Side Pouch Open.png',
      openDuration: 200,
      closeStartMs: 200,
      closeDuration: 200
    }
  };

  let _animationTimeout = null;

  let activePouch = null;

  function syncPouchState() {
    pouchZones.forEach(zone => {
      const isActive = zone.dataset.pouch === activePouch;
      zone.classList.toggle('active', isActive);
      zone.setAttribute('aria-pressed', String(isActive));
    });
  }

  function animatePouch(pouchName) {
    if (!bagImage) return;

    // Clear any pending animation timeout
    if (_animationTimeout) {
      clearTimeout(_animationTimeout);
      _animationTimeout = null;
    }

    const cfg = pouchAnimationMap[pouchName];
    if (!cfg) return;

    // CLOSING: if this pouch is already open, play close animation then revert to base
    if (activePouch === pouchName) {
      _animationTimeout = setTimeout(() => {
        bagImage.src = cfg.closeGif;
        _animationTimeout = setTimeout(() => {
          bagImage.src = bagBaseSrc;
          _animationTimeout = null;
        }, cfg.closeDuration);
      }, cfg.closeStartMs || 0);
      activePouch = null;
      syncPouchState();
      console.log(`Student closed ${pouchName} pouch.`);
      return;
    }

    // OPENING: play open animation, then switch to static open state PNG
    activePouch = pouchName;
    syncPouchState();
    
    // Show open GIF
    bagImage.src = cfg.openGif;
    
    // After open animation completes, switch to static PNG
    _animationTimeout = setTimeout(() => {
      bagImage.src = cfg.openStatePng;
      _animationTimeout = null;
    }, cfg.openDuration);
    
    console.log(`Student opened ${pouchName} pouch.`);
  }

  navToggle.addEventListener('click', function() {
    navLinks.classList.toggle('open');
    navBottomRow.classList.toggle('open');
  });

  document.querySelectorAll('.nav-tab').forEach(tab => {
    tab.addEventListener('click', function() {
      document.querySelectorAll('.nav-tab').forEach(t => t.classList.remove('active'));
      this.classList.add('active');
      const target = document.getElementById('sec-' + this.dataset.section);
      if (target) target.scrollIntoView({ behavior: 'smooth' });
    });
  });

  pouchZones.forEach(zone => {
    zone.addEventListener('click', function() {
      animatePouch(this.dataset.pouch);
    });
  });

  if (bagImage) {
    bagImage.src = bagBaseSrc;
  }
  syncPouchState();
