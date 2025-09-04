const form = document.getElementById("search-form");
const input = document.getElementById("search-input");
const grid = document.getElementById("grid");
const statusEl = document.getElementById("status");

const wikiSection = document.getElementById("wiki-section");
const wikiTitle = document.getElementById("wiki-title");
const wikiExtract = document.getElementById("wiki-extract");
const wikiLink = document.getElementById("wiki-link");
const wikiThumb = document.getElementById("wiki-thumb");

const cardTpl = document.getElementById("card-template");

const MAX_RESULTS = 12; // keep UI snappy

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  const q = input.value.trim();
  if (!q) return;

  grid.innerHTML = "";
  setStatus("Searching recipes…");
  await Promise.all([
    loadWikipedia(q),
    loadRecipes(q)
  ]);
});

function setStatus(text) {
  statusEl.textContent = text || "";
}

async function loadWikipedia(query) {
  // MediaWiki REST Summary API
  const url = https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(query)};
  try {
    const res = await fetch(url, { headers: { "accept": "application/json" } });
    if (!res.ok) throw new Error("No summary");
    const data = await res.json();

    wikiTitle.textContent = data.title || query;
    wikiExtract.textContent = data.extract || "No summary available.";
    wikiLink.href = data.content_urls?.desktop?.page || https://en.wikipedia.org/wiki/${encodeURIComponent(query)};

    // Page image if present
    const thumbSrc = data.thumbnail?.source || data.originalimage?.source;
    if (thumbSrc) {
      wikiThumb.src = thumbSrc;
      wikiThumb.alt = data.title || "Wikipedia image";
      wikiThumb.classList.remove("hidden");
    } else {
      wikiThumb.classList.add("hidden");
    }

    wikiSection.classList.remove("hidden");
  } catch (err) {
    // Hide section if nothing useful
    wikiSection.classList.add("hidden");
  }
}

async function loadRecipes(ingredient) {
  try {
    // 1) Find meals that include the ingredient
    const listUrl = https://www.themealdb.com/api/json/v1/1/filter.php?i=${encodeURIComponent(ingredient)};
    const listRes = await fetch(listUrl);
    const listData = await listRes.json();

    if (!listData.meals) {
      setStatus(No recipes found for “${ingredient}”. Try another ingredient (e.g., chicken, paneer, tomato).);
      return;
    }

    // Limit results
    const meals = listData.meals.slice(0, MAX_RESULTS);

    setStatus(Found ${listData.meals.length} recipe(s). Showing top ${meals.length}.);

    // 2) Fetch full details for each meal
    const detailed = await fetchMealDetails(meals.map(m => m.idMeal));

    // 3) Render cards
    detailed.forEach(renderMealCard);
  } catch (err) {
    console.error(err);
    setStatus("Something went wrong while fetching recipes. Please try again.");
  }
}

async function fetchMealDetails(ids) {
  // Fetch in parallel with small concurrency to be nice
  const chunks = chunk(ids, 4);
  const results = [];
  for (const group of chunks) {
    const promises = group.map(async (id) => {
      const url = https://www.themealdb.com/api/json/v1/1/lookup.php?i=${id};
      const res = await fetch(url);
      const data = await res.json();
      return data.meals?.[0] ?? null;
    });
    const part = await Promise.all(promises);
    results.push(...part.filter(Boolean));
  }
  return results;
}

function chunk(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

function renderMealCard(meal) {
  const card = cardTpl.content.firstElementChild.cloneNode(true);

  const img = card.querySelector(".thumb");
  img.src = meal.strMealThumb;
  img.alt = meal.strMeal;

  card.querySelector(".title").textContent = meal.strMeal;

  const meta = [];
  if (meal.strCategory) meta.push(meal.strCategory);
  if (meal.strArea) meta.push(meal.strArea);
  card.querySelector(".meta").textContent = meta.join(" • ");

  // YouTube link button (fallback to search link if not provided)
  const ytBtn = card.querySelector(".youtube-link");
  const ytUrl = formatYouTubeUrl(meal.strYoutube, meal.strMeal);
  ytBtn.href = ytUrl;

  // Details block
  const details = card.querySelector(".details");

  // Ingredients list
  const ingList = card.querySelector(".ingredients");
  buildIngredients(meal).forEach(li => ingList.appendChild(li));

  // Instructions
  const steps = (meal.strInstructions || "").trim();
  card.querySelector(".instructions").textContent = steps || "No instructions available.";

  // Optional embedded YouTube
  const videoWrap = card.querySelector(".video-wrap");
  const iframe = card.querySelector(".youtube-embed");
  const embed = toYouTubeEmbed(meal.strYoutube);
  if (embed) {
    iframe.src = embed;
    videoWrap.hidden = false;
  } else {
    videoWrap.hidden = true;
  }

  // Source link
  const sourceLink = card.querySelector(".source-link");
  if (meal.strSource) {
    sourceLink.href = meal.strSource;
    sourceLink.textContent = "Original Source";
  } else {
    sourceLink.href = https://www.google.com/search?q=${encodeURIComponent(meal.strMeal + " recipe")};
    sourceLink.textContent = "Search this recipe";
  }

  // Toggle
  const toggleBtn = card.querySelector(".toggle-btn");
  toggleBtn.addEventListener("click", () => {
    const open = details.hasAttribute("hidden") ? false : true;
    if (open) {
      details.setAttribute("hidden", "");
      toggleBtn.setAttribute("aria-expanded", "false");
      toggleBtn.textContent = "View Recipe";
    } else {
      details.removeAttribute("hidden");
      toggleBtn.setAttribute("aria-expanded", "true");
      toggleBtn.textContent = "Hide Recipe";
    }
  });

  grid.appendChild(card);
}

function buildIngredients(meal) {
  const items = [];
  for (let i = 1; i <= 20; i++) {
    const ing = (meal[strIngredient${i}] || "").trim();
    const measure = (meal[strMeasure${i}] || "").trim();
    if (!ing) continue;
    const li = document.createElement("li");
    li.textContent = measure ? ${ing} — ${measure} : ing;
    items.push(li);
  }
  if (!items.length) {
    const li = document.createElement("li");
    li.textContent = "No ingredients listed.";
    items.push(li);
  }
  return items;
}

function formatYouTubeUrl(raw, mealName) {
  if (raw && raw.startsWith("http")) return raw;
  // fallback: search on YouTube
  return https://www.youtube.com/results?search_query=${encodeURIComponent(mealName + " recipe")};
}

function toYouTubeEmbed(raw) {
  if (!raw) return null;
  try {
    const url = new URL(raw);
    const id = url.searchParams.get("v");
    if (!id) return null;
    return https://www.youtube.com/embed/${id};
  } catch {
    return null;
  }
}

// Optional: run a default search on first load
window.addEventListener("DOMContentLoaded", () => {
  input.value = "chicken";
  form.requestSubmit();
});
