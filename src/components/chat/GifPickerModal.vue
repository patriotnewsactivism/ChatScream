<template>
  <div class="gif-picker-overlay" @click.self="close">
    <div class="gif-picker-modal" role="dialog" aria-modal="true">
      <div class="flex items-center mb-2">
        <input
          v-model="search"
          @keyup.enter="searchGifs"
          placeholder="Search GIFs..."
          class="flex-1 p-2 border rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <button @click="searchGifs" class="ml-2 px-3 py-2 bg-blue-500 text-white rounded focus:outline-none focus:ring-2 focus:ring-primary-500 min-w-[44px] min-h-[44px]">
          Search
        </button>
        <button @click="close" class="ml-2 px-3 py-2 bg-gray-300 text-gray-800 rounded focus:outline-none focus:ring-2 focus:ring-primary-500 min-w-[44px] min-h-[44px]">
          Close
        </button>
      </div>
      <div v-if="loading" class="gif-loading text-center py-4">Loading...</div>
      <div v-else-if="error" class="gif-error text-red-500 text-center py-4">{{ error }}</div>
      <div v-else class="gif-grid">
        <div
          v-for="gif in gifs"
          :key="gif.id"
          class="gif-item"
          @click="selectGif(gif.images.fixed_width_small.url)"
        >
          <img
            :src="gif.images.fixed_width_small.url"
            :alt="gif.title"
            class="w-full h-auto"
          />
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, defineEmits } from 'vue';

const emit = defineEmits(['close', 'select']);

const API_KEY = import.meta.env.VITE_GIPHY_API_KEY || 'dc6zaTOxFJmzC';

const search = ref('');
const gifs = ref([]);
const loading = ref(false);
const error = ref('');

function close() {
  emit('close');
}

async function searchGifs() {
  if (!search.value.trim()) return;
  loading.value = true;
  error.value = '';
  try {
    const resp = await fetch(
      `https://api.giphy.com/v1/gifs/search?api_key=${API_KEY}&q=${encodeURIComponent(search.value)}&limit=25&offset=0&rating=G&lang=en`
    );
    if (!resp.ok) throw new Error('Network response was not ok');
    const data = await resp.json();
    gifs.value = data.data;
    if (gifs.value.length === 0) {
      error.value = 'No results found';
    }
  } catch (e) {
    console.error(e);
    error.value = 'Failed to load GIFs';
  } finally {
    loading.value = false;
  }
}

function selectGif(url) {
  emit('select', url);
  close();
}
</script>

<style scoped>
.gif-picker-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 1000;
}

.gif-picker-modal {
  background: #fff;
  padding: 16px;
  border-radius: 8px;
  max-width: 90vw;
  max-height: 90vh;
  overflow-y: auto;
  width: 400px;
}

.gif-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(80px, 1fr));
  gap: 8px;
}

.gif-item {
  cursor: pointer;
  border: 2px solid transparent;
  border-radius: 4px;
  overflow: hidden;
  transition: border-color 0.2s;
}

.gif-item:hover {
  border-color: #3b82f6; /* blue-500 */
}

.gif-loading,
.gif-error {
  font-size: 0.9rem;
}
</style>