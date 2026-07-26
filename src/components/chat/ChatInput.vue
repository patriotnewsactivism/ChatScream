<template>
  <div class="chat-input">
    <!-- Offline banner -->
    <div v-if="!isConnected" class="offline-banner">
      You are offline. Drafts will be saved locally.
    </div>
    <!-- Draft status indicator -->
    <div v-if="draft" class="draft-indicator">
      Draft saved
      <button @click="discardDraft" class="discard-button">Discard</button>
    </div>
    <!-- Chat input field -->
    <textarea v-model="message" @input="handleInput" placeholder="Type your message..."></textarea>
  </div>
</template>

<script>
import { ref, onMounted, onUnmounted } from 'vue';
import { useAuth } from '@/hooks/useAuth';
import { useDraft } from '@/hooks/useDraft';

export default {
  setup() {
    const { user } = useAuth();
    const { saveDraft, getDraft, discardDraft, isConnected } = useDraft();
    const message = ref('');
    const draft = ref(null);

    const loadDraft = async () => {
      const savedDraft = await getDraft(user.id);
      if (savedDraft) {
        message.value = savedDraft;
        draft.value = savedDraft;
      }
    };

    onMounted(() => {
      loadDraft();
    });

    const handleInput = () => {
      saveDraft(user.id, message.value);
      draft.value = message.value;
    };

    return {
      message,
      draft,
      isConnected,
      handleInput,
      discardDraft
    };
  }
};
</script>

<style scoped>
.chat-input {
  position: relative;
}
.offline-banner {
  background-color: #ffcc00;
  color: #000;
  padding: 10px;
  text-align: center;
}
.draft-indicator {
  background-color: #e0e0e0;
  padding: 5px;
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.discard-button {
  background-color: #ff6666;
  color: #fff;
  border: none;
  padding: 5px 10px;
  cursor: pointer;
}
textarea {
  width: 100%;
  height: 100px;
  padding: 10px;
  box-sizing: border-box;
}
</style>
