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
      closeDuration: 1500
    },
    middle: {
      openGif: 'images/landing-bag/Go Bag Middle Pouch.gif',
      closeGif: 'images/landing-bag/Go Bag Middle Pouch Close.gif',
      openStatePng: 'images/landing-bag/Go Bag Middle Pouch Open.png',
      openDuration: 1100,
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

// ====== CHARACTER ANIMATION 1 ======
const charAnimationStates = [
  'images/char-walk-towards.gif',
  'images/char-walk-left.gif',
  'images/char-walk-backwards.gif',
  'images/char-walk-right.gif'
];
let currentCharState = 0;
const charImages = Array.from(document.querySelectorAll('.char-animation'));

function cycleCharAnimation() {
  if (!charImages.length) return;
  const currentGif = charAnimationStates[currentCharState];
  charImages.forEach(charImg => { charImg.src = currentGif; });

  setTimeout(() => {
    currentCharState = (currentCharState + 1) % charAnimationStates.length;
    cycleCharAnimation(); // Calls itself
  }, 1500);
}
cycleCharAnimation();

// ====== CHARACTER ANIMATION 2 ======
const charAnimationStates2 = [
  'images/char-walk-towards2.gif',
  'images/char-walk-right2.gif',
  'images/char-walk-backwards2.gif',
  'images/char-walk-left2.gif'
];
let currentCharState2 = 0;
const charImages2 = Array.from(document.querySelectorAll('.char-animation2')); // Corrected Selector

function cycleCharAnimation2() {
  if (!charImages2.length) return; // Corrected check
  const currentGif2 = charAnimationStates2[currentCharState2];
  charImages2.forEach(charImg2 => { charImg2.src = currentGif2; });

  setTimeout(() => {
    currentCharState2 = (currentCharState2 + 1) % charAnimationStates2.length; // Corrected Modulo
    cycleCharAnimation2(); // Corrected function call (calls itself)
  }, 1500);
}
cycleCharAnimation2();

  // ====== ITEM SELECTION - Update detail card on click ======
  const itemCells = document.querySelectorAll('.item-cell');
  const itemDetailCard = document.querySelector('.item-detail-card');
  
  // Sample item data (you can customize with actual items)
  const itemsDatabase = [
    { id: 1, name: 'Water Bottle', weight: '500g', importance: 'Critical' },
    { id: 2, name: 'First Aid Kit', weight: '300g', importance: 'Critical' },
    { id: 3, name: 'Flashlight', weight: '150g', importance: 'High' },
    { id: 4, name: 'Whistle', weight: '50g', importance: 'High' },
    { id: 5, name: 'ID Card', weight: '5g', importance: 'Critical' },
    { id: 6, name: 'Phone Charger', weight: '100g', importance: 'Medium' },
    { id: 7, name: 'Medications', weight: '50g', importance: 'Critical' },
    { id: 8, name: 'Snacks', weight: '200g', importance: 'High' },
    { id: 9, name: 'Blanket', weight: '500g', importance: 'Medium' },
    { id: 10, name: 'Rope', weight: '200g', importance: 'Medium' },
    { id: 11, name: 'Gloves', weight: '100g', importance: 'Medium' },
    { id: 12, name: 'Mask', weight: '20g', importance: 'High' },
    { id: 13, name: 'Cash', weight: '0g', importance: 'High' },
    { id: 14, name: 'Documents', weight: '100g', importance: 'Critical' },
    { id: 15, name: 'Photos', weight: '50g', importance: 'Medium' },
    { id: 16, name: 'Knife', weight: '150g', importance: 'Medium' },
    { id: 17, name: 'Map', weight: '30g', importance: 'Medium' },
    { id: 18, name: 'Matches', weight: '20g', importance: 'High' },
    { id: 19, name: 'Lighter', weight: '50g', importance: 'High' },
    { id: 20, name: 'Paperclips', weight: '10g', importance: 'Low' },
    { id: 21, name: 'Tape', weight: '50g', importance: 'Medium' },
    { id: 22, name: 'Bandages', weight: '100g', importance: 'High' },
    { id: 23, name: 'Scissors', weight: '50g', importance: 'Medium' },
    { id: 24, name: 'Tweezers', weight: '20g', importance: 'Low' },
    { id: 25, name: 'Thermometer', weight: '30g', importance: 'Medium' },
    { id: 26, name: 'Antibiotic', weight: '20g', importance: 'High' },
    { id: 27, name: 'Painkillers', weight: '20g', importance: 'High' },
    { id: 28, name: 'Hand Sanitizer', weight: '150g', importance: 'Medium' },
    { id: 29, name: 'Wet Wipes', weight: '100g', importance: 'Medium' },
    { id: 30, name: 'Trash Bags', weight: '50g', importance: 'Low' }
  ];
  
  itemCells.forEach((cell, index) => {
    cell.addEventListener('click', function() {
      // Remove active class from all cells
      itemCells.forEach(c => c.classList.remove('active'));
      
      // Add active class to clicked cell
      this.classList.add('active');
      
      // Update detail card with item info
      if (itemDetailCard && index < itemsDatabase.length) {
        const item = itemsDatabase[index];
        const itemPreview = itemDetailCard.querySelector('.item-preview');
        const itemName = itemDetailCard.querySelector('.item-name');
        const itemMetas = itemDetailCard.querySelectorAll('.item-meta');
        
        // Update preview (add color based on importance)
        const importanceColors = {
          'Critical': '#FF4444',
          'High': '#FF9944',
          'Medium': '#FFDD44',
          'Low': '#44DD44'
        };
        if (itemPreview) {
          itemPreview.style.backgroundColor = importanceColors[item.importance] || '#CCCCCC';
        }
        
        // Update name and details
        if (itemName) itemName.textContent = item.name;
        if (itemMetas[0]) itemMetas[0].textContent = 'Weight: ' + item.weight;
        if (itemMetas[1]) itemMetas[1].textContent = 'Importance: ' + item.importance;
      }
    });
  });
  
  // Select first item by default
  if (itemCells.length > 0) {
    itemCells[0].click();
  }
