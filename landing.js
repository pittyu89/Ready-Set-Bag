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

// Revised 20-item database following your project specifications
const itemsDatabase = {
  "water": { name: 'Water Bottle', weight: '1.5 kg', importance: 'Critical', desc: 'Clean drinking water for 72-hour hydration. The average person needs water for survival. PHIVOLCS Priority #1', img: 'images/items/Water Bottle.png' },
  "canned-food": { name: 'Canned Food', weight: '800g', importance: 'Critical', desc: 'Non-perishable energy source (sardines, corned beef, or canned tuna). 3-day food supply.', img: 'images/items/cannedgood.png' },
  "ziplock": { name: 'Ziplock Bag', weight: '30g', importance: 'Medium', desc: 'Waterproof storage, waste disposal, and a makeshift raincoat.', img: 'images/items/ziplock.png' },
  "whistle": { name: 'Whistle', weight: '20g', importance: 'Critical', desc: 'Signal rescuers without exhausting your voice. Sound travels farther than shouting. Essential for trapped victims.', img: 'images/items/whistle.png' },
  "flashlight": { name: 'Hand-Pressing Flashlight', weight: '200g', importance: 'Critical', desc: 'Provides light during power outages or night.', img: 'images/items/flashlight2.png' },
  "first-aid-kit": { name: 'First Aid Kit', weight: '500g', importance: 'Critical', desc: 'Basic medical supplies: bandages, gauze, alcohol, betadine, and tape. Treats injuries and prevents infection. Supplies for treating minor injuries and wounds.', img: 'images/items/medkit.png ' },
  "maintenance-meds": { name: 'Prescription Medication', weight: '100g', importance: 'Low', desc: 'Required medicines for chronic conditions (asthma, diabetes, allergies). Only if the student has medical needs.', img: 'images/items/medication.png' },
  "Toiletries": { name: 'Toiletries (mini kit)', weight: '150g', importance: 'Medium', desc: 'A small soap, toothbrush, and toothpaste. Maintains hygiene during an extended shelter stay.', img: 'images/items/toiletries.png' },
  "face-mask": { name: 'Dust Mask (N95)', weight: '20g', importance: 'High', desc: 'Protects the respiratory system from dust and ash.', img: 'images/items/95 mask.png' },
  "blanket": { name: 'Emergency Thermal Blanket', weight: '200g', importance: 'High', desc: 'Thermal/space blanket. Prevents hypothermia, reflects body heat. Compact and lightweight.', img: 'images/items/blanket.png' },
  "radio": { name: 'Radio', weight: '220g', importance: 'High', desc: 'Receives emergency broadcasts and government updates. Situational awareness when networks down.', img: 'images/items/radio.png' },
  "batteries": { name: 'Batteries (4× AA)', weight: '100g', importance: 'High', desc: 'Power backup for radio. Extends usability when original batteries drain. Replacement power for radio and flashlight.', img: 'images/items/aa batteries.png' },
  "glowsticks": { name: 'Glowsticks', weight: '100g', importance: 'Medium', desc: 'Backup lighting when batteries fail. Store matches in a waterproof container.', img: 'images/items/glowsticks.png' },
  "pocketknife": { name: 'Pocket Knife', weight: '150g', importance: 'Medium', desc: 'Multi-use tool for cutting, opening cans, and minor repairs.', img: 'images/items/pockeknife.png' },
  "clothes": { name: 'Spare Clothes (1 set)', weight: '500g', importance: 'High', desc: 'Clean underwear, shirt, and pants. Maintains hygiene and warmth after evacuation.', img: 'images/items/clothes.png' },
  "id-documents": { name: 'Important Documents', weight: '100g', importance: 'High', desc: 'Photocopies of ID, birth certificate, and insurance. Needed for aid claims and identification.', img: 'images/items/importantdocuments.png' },
  "cash": { name: 'Emergency Cash', weight: '50g', importance: 'Low', desc: 'Emergency purchases, transportation. Small bills for easier transactions when stores open.', img: 'images/items/money.png' },
  "emergency-contacts": { name: 'Emergency Contact Card', weight: '10g', importance: 'High', desc: 'Names; phone numbers of family, barangay, hospital, and police. Critical for separated families.', img: 'images/items/contactcard.png' },
  "Rope": { name: 'Rope', weight: '200g', importance: 'High', desc: 'Rescue operations, securing items, climbing. Multi-purpose emergency tool.', img: 'images/items/rope.png' },
  "notebook-pen": { name: 'Pen & Paper', weight: '50g', importance: 'Medium', desc: 'Write emergency notes, leave messages for family, and record important information.', img: 'images/items/penpaper.png' }
};

const importanceColors = {
  'Critical': '#FF4444',
  'High': '#FF9944',
  'Medium': '#FFDD44',
  'Low': '#44DD44'
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