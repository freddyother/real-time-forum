// views/view-new-post.js
// New post page with category chips and optional custom category

import { apiCreatePost } from '../api.js'
import { navigateTo } from '../router.js'

// Base categories shown as chips
const BASE_CATEGORIES = [
  'General',
  'Tech-support',
  'Technology',
  'Announcements',
  'FAQ',
  'Fashion',
  'Travel',
  'Marketplace',
  'Gaming',
  'Introductions',
  'Go',
  'JavaScript',
]

export function renderNewPostView(root) {
  const container = document.createElement('div')
  container.className = 'new-post-card'

  container.innerHTML = `
    <div class="new-post-header">
      <h2>New post</h2>
      <p>Share something with the forum.</p>
    </div>

    <form id="newPostForm" class="new-post-form">
      <input
        type="text"
        id="postTitle"
        placeholder="Title"
        required
      />

      <div class="category-section">
        <div class="category-label">Category</div>
        <div class="category-chips" id="categoryChips"></div>
        <input
          type="text"
          id="categoryInput"
          class="category-input"
          placeholder="Or type a new category and press Enter"
          maxlength="15"
        />
      </div>

      <textarea
        id="postContent"
        placeholder="Write your post here..."
        required
      ></textarea>

      <button type="submit" class="new-post-submit">
        Publish post
      </button>
    </form>
  `

  root.appendChild(container)

  const chipsContainer = container.querySelector('#categoryChips')
  const customInput = container.querySelector('#categoryInput')
  const form = container.querySelector('#newPostForm')

  // Currently selected category value
  let selectedCategory = null

  // Marks one chip as selected and stores its value
  function setSelectedCategory(name) {
    selectedCategory = name

    chipsContainer.querySelectorAll('.category-chip').forEach((chip) => {
      chip.classList.toggle('is-selected', chip.textContent === name)
    })
  }

  // Render base categories as chips
  BASE_CATEGORIES.forEach((name, index) => {
    const chip = document.createElement('button')
    chip.type = 'button'
    chip.className = 'category-chip'
    chip.textContent = name

    chip.addEventListener('click', () => {
      setSelectedCategory(name)
    })

    chipsContainer.appendChild(chip)

    // Preselect the first category by default
    if (index === 0 && !selectedCategory) {
      setSelectedCategory(name)
    }
  })

  /*----------------------------------------------------------------------------------
  Handles a custom category typed by the user
  -----------------------------------------------------------------------------------
  */
  function handleCustomCategory() {
    const raw = customInput.value.trim()
    if (!raw) return

    // Limit length to 15 characters
    if (raw.length > 15) {
      alert('Category names must be 15 characters or fewer.')
      return
    }
    const normalised = raw.toLowerCase()

    // Check if category already exists (case-insensitive)
    const existing = Array.from(chipsContainer.querySelectorAll('.category-chip')).find((chip) => chip.textContent.toLowerCase() === normalised)

    if (existing) {
      // If it exists, simply select it and do not create a duplicate
      setSelectedCategory(existing.textContent)
      customInput.value = ''
      return
    }

    // Create a new chip for this custom category
    const chip = document.createElement('button')
    chip.type = 'button'
    chip.className = 'category-chip'
    chip.textContent = raw

    chip.addEventListener('click', () => {
      setSelectedCategory(raw)
    })

    chipsContainer.appendChild(chip)
    setSelectedCategory(raw)
    customInput.value = ''
  }

  // When the user presses Enter in the custom category input
  customInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      handleCustomCategory()
    }
  })

  // Submit handler to create the post
  form.addEventListener('submit', async (e) => {
    e.preventDefault()

    const title = container.querySelector('#postTitle').value.trim()
    const content = container.querySelector('#postContent').value.trim()

    if (!title || !content) {
      alert('Please fill in a title and some content.')
      return
    }

    if (!selectedCategory) {
      alert('Please choose a category.')
      return
    }

    try {
      await apiCreatePost({
        title,
        category: selectedCategory,
        content,
      })

      navigateTo('feed')
    } catch (err) {
      console.error('Failed to create post:', err)
      alert('Could not create post. Please try again.')
    }
  })
}
