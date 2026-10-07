const nav = document.getElementById('main-nav');
const navToggle = document.getElementById('nav-toggle');
const navMenu = document.getElementById('nav-menu');
const navTabs = Array.from(navMenu.querySelectorAll('.nav-tab'));

// Each tab starts and ends at the bag: give it the distance back to the bag's
// centre, and its place in the queue counted from the bag (nearest comes out
// first, furthest goes back in first). offsetLeft/Top ignore transforms, so
// this reads the tabs' open positions even while they are tucked away.
function measureNavTabs() {
  const bagX = navToggle.offsetLeft + navToggle.offsetWidth / 2;
  const bagY = navToggle.offsetTop + navToggle.offsetHeight / 2;
  const byDistance = navTabs
    .map(tab => {
      // Tabs are measured inside the menu, the bag inside the nav
      const dx = bagX - (navMenu.offsetLeft + tab.offsetLeft + tab.offsetWidth / 2);
      const dy = bagY - (navMenu.offsetTop + tab.offsetTop + tab.offsetHeight / 2);
      tab.style.setProperty('--from-x', dx + 'px');
      tab.style.setProperty('--from-y', dy + 'px');
      return { tab, distance: Math.hypot(dx, dy) };
    })
    .sort((a, b) => a.distance - b.distance);
  byDistance.forEach(({ tab }, i) => {
    tab.style.setProperty('--i', i);
    tab.style.setProperty('--back', byDistance.length - 1 - i);
  });
}

function playBag(name) {
  navToggle.classList.remove('bounce', 'gulp');
  void navToggle.offsetWidth; // restart the animation
  navToggle.classList.add(name);
}

function setNavOpen(open) {
  if (nav.classList.contains('open') === open) return;
  if (open) measureNavTabs();
  nav.classList.toggle('open', open);
  navToggle.setAttribute('aria-expanded', open);
  navToggle.setAttribute('aria-label', open ? 'Close navigation' : 'Open navigation');
  playBag(open ? 'bounce' : 'gulp');
}

navToggle.addEventListener('click', () => setNavOpen(!nav.classList.contains('open')));
navToggle.addEventListener('animationend', () => navToggle.classList.remove('bounce', 'gulp'));
window.addEventListener('resize', measureNavTabs);
measureNavTabs();

// Tapping anywhere else, or Escape, puts the tabs away
document.addEventListener('click', e => {
  if (!nav.contains(e.target)) setNavOpen(false);
});
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') setNavOpen(false);
});

navTabs.forEach(tab => {
  tab.addEventListener('click', function() {
    // Tabs without a data-section (e.g. "portal login") are real links —
    // let the browser navigate instead of hijacking the click.
    if (!this.dataset.section) return;
    navTabs.forEach(t => t.classList.remove('active'));
    this.classList.add('active');
    const target = document.getElementById('sec-' + this.dataset.section);
    if (target) target.scrollIntoView({ behavior: 'smooth' });
    // On a phone or tablet the open tabs cover the page, so pack them away
    if (window.matchMedia('(max-width: 768px)').matches) setNavOpen(false);
  });
});

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