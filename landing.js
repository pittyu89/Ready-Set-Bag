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
      // Tabs without a data-section (e.g. "portal login") are real links —
      // let the browser navigate instead of hijacking the click.
      if (!this.dataset.section) return;
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

// The 20 essentials, in the game's order, with the game's names, weights, importance
// and descriptions (Assets/Resources/ItemData). Keep in step when the game changes.
const itemsDatabase = {
  "water": { name: 'Water Bottle', weight: '1.5 kg', importance: 'Critical', desc: 'Clean drinking water for 72-hour hydration.', img: 'images/items/Water Bottle.png' },
  "first-aid-kit": { name: 'First Aid Kit', weight: '500 g', importance: 'Critical', desc: 'Treats injuries and prevents infection.', img: 'images/items/medkit.png' },
  "flashlight": { name: 'Flashlight (Small or Big)', weight: '200–400 g', importance: 'Critical', desc: 'Light during power outages. The small one is light and compact, leaving weight for other supplies; the big one is brighter and lasts longer, but is heavier to carry.', img: 'images/items/flashlight2.png' },
  "whistle": { name: 'Whistle', weight: '20 g', importance: 'Critical', desc: 'Signal rescuers without exhausting your voice. Sound travels farther than shouting.', img: 'images/items/whistle.png' },
  "canned-food": { name: 'Canned Food (Corned Beef or Fish)', weight: '400 g', importance: 'Critical', desc: 'Non-perishable energy source. 3-day food supply.', img: 'images/items/cannedgood.png' },
  "face-mask": { name: 'N95 Mask', weight: '20 g', importance: 'Important', desc: 'Filters fine dust, debris and smoke so you can breathe safely.', img: 'images/items/95 mask.png' },
  "blanket": { name: 'Thermal Blanket', weight: '200 g', importance: 'Important', desc: 'A light foil sheet that wraps around the body to hold in heat.', img: 'images/items/blanket.png' },
  "maintenance-meds": { name: 'Medication', weight: '100 g', importance: 'Useful', desc: 'Personal and maintenance medicines, since pharmacies may be closed after a disaster.', img: 'images/items/medication.png' },
  "clothes": { name: 'Spare Clothes', weight: '500 g', importance: 'Important', desc: 'Maintains hygiene and warmth after evacuation.', img: 'images/items/clothes.png' },
  "rope": { name: 'Rope', weight: '200 g', importance: 'Important', desc: 'At least 7 meters of rope ties down tents and tarps, and secures or carries items.', img: 'images/items/rope.png' },
  "ziplock": { name: 'Ziplock Bag', weight: '30 g', importance: 'Useful', desc: 'Keeps small items like medicine and papers dry and clean.', img: 'images/items/ziplock.png' },
  "glowsticks": { name: 'Glow Sticks', weight: '100 g', importance: 'Useful', desc: 'Gives light without batteries or a flame, and doubles as a signal for help.', img: 'images/items/glowsticks.png' },
  "pocketknife": { name: 'Pocket Knife', weight: '150 g', importance: 'Useful', desc: 'Multi-use tool for cutting rope and cloth, and for minor repairs.', img: 'images/items/pockeknife.png' },
  "gloves": { name: 'Gloves', weight: '100 g', importance: 'Useful', desc: 'Heavy-duty work gloves that protect your hands while clearing debris and broken glass.', img: 'images/items/gloves.png' },
  "radio": { name: 'Radio', weight: '220 g', importance: 'Important', desc: 'Picks up news and official announcements when there is no internet or electricity.', img: 'images/items/radio.png' },
  "batteries": { name: 'Batteries', weight: '100 g', importance: 'Important', desc: 'Powers flashlights, radios and other devices when there is no electricity.', img: 'images/items/aa batteries.png' },
  "id-documents": { name: 'Important Documents', weight: '100 g', importance: 'Important', desc: 'Copies of your birth certificate, school and medical records, needed to register for relief and aid.', img: 'images/items/importantdocuments.png' },
  "emergency-contacts": { name: 'Contact Card', weight: '10 g', importance: 'Important', desc: 'Lists your name, address and family phone numbers, so you or anyone helping you can reach them.', img: 'images/items/contactcard.png' },
  "toiletries": { name: 'Toiletries', weight: '150 g', importance: 'Useful', desc: 'Soap, toothbrush and other hygiene supplies that help prevent illness in crowded shelters.', img: 'images/items/toiletries.png' },
  "notebook-pen": { name: 'Pen & Paper', weight: '50 g', importance: 'Useful', desc: 'For writing down information, leaving messages and drawing maps.', img: 'images/items/penpaper.png' }
};

const importanceColors = {
  'Critical': '#FF4444',
  'Important': '#FF9944',
  'Useful': '#FFDD44'
};

itemCells.forEach((cell) => {
  cell.addEventListener('click', function() {
    // Remove active class from all cells
    itemCells.forEach(c => c.classList.remove('active'));
    
    // Add active class to clicked cell
    this.classList.add('active');
    
    const itemKey = this.getAttribute('data-item');
    const item = itemsDatabase[itemKey];

    if (itemDetailCard && item) {
      const itemPreview = itemDetailCard.querySelector('.item-preview');
      const itemName = itemDetailCard.querySelector('.item-name');
      const itemMetas = itemDetailCard.querySelectorAll('.item-meta');
      
      // Update preview background and inner image
      if (itemPreview) {
        itemPreview.style.backgroundColor = importanceColors[item.importance] || '#CCCCCC';
        itemPreview.innerHTML = `<img src="${item.img}" style="width:100%; height:100%; object-fit:contain; image-rendering:pixelated; padding:15%;">`;
      }
      
      // Update name and details
      if (itemName) itemName.textContent = item.name;
      if (itemMetas[0]) itemMetas[0].textContent = 'Weight: ' + item.weight;
      if (itemMetas[1]) itemMetas[1].textContent = 'Importance: ' + item.importance;
      
      // Check for description element, create if missing
      let itemDesc = itemDetailCard.querySelector('.item-description');
      if (!itemDesc) {
        itemDesc = document.createElement('div');
        itemDesc.className = 'item-meta item-description';
        itemDetailCard.querySelector('div:last-child').appendChild(itemDesc);
      }
      itemDesc.textContent = 'Info: ' + item.desc;
    }
  });
});

// Select first item by default
if (itemCells.length > 0) {
  itemCells[0].click();
}