// ExpatLawyerSpain - Main JS

window.lastSearchFilters = window.lastSearchFilters || { city: '', specialty: '' };

function updateLastSearchFilters(city, specialty) {
  window.lastSearchFilters = {
    city: city || document.getElementById('city-select')?.value || '',
    specialty: specialty || document.getElementById('specialty-select')?.value || ''
  };
}

function setSelectValue(selectEl, targetValue) {
  if (!selectEl || !targetValue) return;
  const option = Array.from(selectEl.options).find(opt => (opt.value || opt.text).trim() === targetValue);
  if (option) {
    selectEl.value = option.value || option.text;
    option.selected = true;
    selectEl.dispatchEvent(new Event('change', { bubbles: true }));
  }
}

function searchLawyers() {
  const city = document.getElementById('city-select').value;
  const specialty = document.getElementById('specialty-select').value;
  updateLastSearchFilters(city, specialty);
  filterListings(city, specialty);
  document.getElementById('listings-grid').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function filterSpecialty(specialty) {
  document.getElementById('specialty-select').value = specialty;
  updateLastSearchFilters('', specialty);
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

  updateLastSearchFilters(city, specialty);
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

function prefill(lawyerName, city, specialty) {
  const hiddenLawyer = document.getElementById('hidden-lawyer');
  const hiddenCity = document.getElementById('hidden-city');
  const regionSelect = document.getElementById('enquiry-region');
  const specialtySelect = document.getElementById('enquiry-specialty');
  const selectedSearchCity = city || document.getElementById('city-select')?.value || window.lastSearchFilters?.city || '';
  const selectedSearchSpecialty = specialty || document.getElementById('specialty-select')?.value || window.lastSearchFilters?.specialty || '';
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
  if (hiddenCity) hiddenCity.value = selectedSearchCity;

  if (regionSelect) {
    regionSelect.value = regionValueMap[selectedSearchCity] || '';
  }

  if (specialtySelect) {
    specialtySelect.value = specialtyValueMap[selectedSearchSpecialty] || '';
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

document.getElementById('city-select')?.addEventListener('change', () => updateLastSearchFilters());
document.getElementById('specialty-select')?.addEventListener('change', () => updateLastSearchFilters());

applyFiltersFromUrl();
