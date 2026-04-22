// ExpatLawyerSpain - Main JS

function searchLawyers() {
  const city = document.getElementById('city-select').value;
  const specialty = document.getElementById('specialty-select').value;
  window.lastSearchFilters = { city, specialty };
  filterListings(city, specialty);
  document.getElementById('listings-grid').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function filterSpecialty(specialty) {
  document.getElementById('specialty-select').value = specialty;
  window.lastSearchFilters = { city: '', specialty };
  filterListings('', specialty);
  document.getElementById('listings-grid').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function applyFiltersFromUrl() {
  const params = new URLSearchParams(window.location.search);
  const city = params.get('city') || '';
  const specialty = params.get('specialty') || '';

  if (!city && !specialty) return;

  const citySelect = document.getElementById('city-select');
  const specialtySelect = document.getElementById('specialty-select');

  if (citySelect && city) citySelect.value = city;
  if (specialtySelect && specialty) specialtySelect.value = specialty;

  window.lastSearchFilters = { city, specialty };
  filterListings(city, specialty);

  const listingsGrid = document.getElementById('listings-grid');
  if (listingsGrid) {
    listingsGrid.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
}

function getDataList(card, key) {
  const raw = card.dataset[key] || '';
  return raw
    .split(',')
    .map(item => item.trim())
    .filter(Boolean);
}

function filterListings(city, specialty) {
  const cards = document.querySelectorAll('.lawyer-card');
  let visible = 0;

  cards.forEach(card => {
    const cardCities = getDataList(card, 'city');
    const cardSpecialties = getDataList(card, 'specialty');

    const cityMatch = !city || cardCities.includes(city) || cardCities.includes('nationwide');
    const specialtyMatch = !specialty || cardSpecialties.includes(specialty);

    if (cityMatch && specialtyMatch) {
      card.style.display = 'flex';
      visible++;
    } else {
      card.style.display = 'none';
    }
  });

  const noResults = document.getElementById('no-results');
  noResults.style.display = visible === 0 ? 'block' : 'none';
}

function prefill(lawyerName, city) {
  const hiddenLawyer = document.getElementById('hidden-lawyer');
  const hiddenCity = document.getElementById('hidden-city');
  const form = document.querySelector('.contact-form');
  const regionSelect = form ? form.querySelector('select[name="region"]') : null;
  const specialtySelect = form ? form.querySelector('select[name="specialty"]') : null;
  const selectedSearchCity = window.lastSearchFilters?.city || document.getElementById('city-select')?.value || city || '';
  const selectedSearchSpecialty = window.lastSearchFilters?.specialty || document.getElementById('specialty-select')?.value || '';
  const regionValueMap = {
    barcelona: 'Barcelona',
    madrid: 'Madrid',
    malaga: 'Málaga',
    valencia: 'Valencia',
    alicante: 'Alicante',
    seville: 'Seville',
    marbella: 'Marbella',
    'costa-del-sol': 'Costa del Sol',
    palma: 'Palma de Mallorca',
    nationwide: 'Other / Nationwide'
  };
  const specialtyValueMap = {
    immigration: 'Immigration & Residency',
    property: 'Property Law',
    employment: 'Employment Law',
    family: 'Family Law',
    criminal: 'Criminal Law',
    tax: 'Tax & Fiscal',
    business: 'Business & Corporate',
    wills: 'Wills & Inheritance'
  };

  if (hiddenLawyer) hiddenLawyer.value = lawyerName;
  if (hiddenCity) hiddenCity.value = selectedSearchCity || city;

  if (regionSelect && selectedSearchCity && regionValueMap[selectedSearchCity]) {
    regionSelect.value = regionValueMap[selectedSearchCity];
  }

  if (specialtySelect && selectedSearchSpecialty && specialtyValueMap[selectedSearchSpecialty]) {
    specialtySelect.value = specialtyValueMap[selectedSearchSpecialty];
  }

  // Show the lawyer banner
  const banner = document.getElementById('form-lawyer-banner');
  const nameSpan = document.getElementById('form-lawyer-name');
  const title = document.getElementById('form-title');
  const subtitle = document.getElementById('form-subtitle');
  if (banner && nameSpan) {
    nameSpan.textContent = lawyerName;
    banner.style.display = 'block';
    title.textContent = 'Send an enquiry to ' + lawyerName;
    subtitle.textContent = 'Fill in your details below and we will forward your message to this firm within 24 hours.';
  }

  document.getElementById('contact-form').scrollIntoView({ behavior: 'smooth' });
}

function clearPrefill() {
  document.getElementById('hidden-lawyer').value = '';
  document.getElementById('hidden-city').value = '';
  document.getElementById('form-lawyer-banner').style.display = 'none';
  document.getElementById('form-title').textContent = 'Send an enquiry';
  document.getElementById('form-subtitle').textContent = 'Tell us what you need and we\'ll connect you with the right English-speaking lawyer - usually within 24 hours.';
}

function submitForm(e) {
  e.preventDefault();
  document.querySelector('.contact-form').style.display = 'none';
  document.getElementById('form-success').style.display = 'block';
  // TODO: wire up to Formspree or Netlify Forms on deployment
}

// Smooth scroll for anchor links
document.querySelectorAll('a[href^="#"]').forEach(anchor => {
  anchor.addEventListener('click', function(e) {
    const target = document.querySelector(this.getAttribute('href'));
    if (target) {
      e.preventDefault();
      target.scrollIntoView({ behavior: 'smooth' });
    }
  });
});

applyFiltersFromUrl();
