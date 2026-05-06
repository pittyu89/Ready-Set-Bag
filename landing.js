const navToggle = document.getElementById('nav-toggle');
  const navLinks = document.getElementById('nav-links');
  const navBottomRow = document.getElementById('nav-bottom-row');

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
