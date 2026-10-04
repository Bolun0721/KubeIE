<script setup lang="ts">
import { onMounted } from 'vue'
import EditorView from './components/EditorView.vue'
import SetupView from './components/SetupView.vue'
import { useEditor } from './composables/useEditor'

const { state, bootstrap } = useEditor()

onMounted(() => {
  void bootstrap()
})
</script>

<template>
  <div v-loading="state.loading" element-loading-text="正在初始化…" class="app-root">
    <EditorView v-if="state.location" />
    <SetupView v-else />
  </div>
</template>

<style scoped>
.app-root {
  height: 100%;
}
</style>
