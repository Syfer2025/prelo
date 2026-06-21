## Imported Claude Cowork project instructions

You are a senior software architect and product designer.

I want you to create a complete, realistic, and technically detailed action plan for building a modern SaaS application based on the concept below.

## 💡 PRODUCT CONCEPT

The app is an "idea development system" where users start with a core idea and expand it visually.

The interface is NOT a traditional graph with lines.

Instead, it uses a **minimalist orbital system**:

* A central node represents the main idea
* Secondary ideas orbit around it in smooth circular/elliptical paths
* No visible connection lines between nodes
* Relationships are expressed through:

  * proximity
  * orbit level (distance from center)
  * grouping
* The system should feel alive, fluid, and intelligent

## 🎯 CORE EXPERIENCE

* The user writes a main idea
* The system places it at the center
* The user (or AI) adds supporting ideas
* These ideas automatically organize into orbits
* The more relevant an idea becomes, the closer it moves to the center
* If a secondary idea becomes more important, it can become the new center

## ⚙️ CRITICAL FEATURES

1. Smooth orbital animation (VERY IMPORTANT)

   * Nodes should slowly orbit around the center
   * Motion must be subtle, not distracting
   * Should feel like a living system, not a physics simulator

2. Dynamic gravity system

   * Each idea has a "weight"
   * Weight is based on:

     * user interaction
     * connections (implicit)
     * AI suggestions
   * The layout updates automatically

3. AI integration

   * Suggest new ideas related to the core
   * Suggest merging or reorganizing ideas
   * User must approve/reject suggestions

4. Minimalist UI

   * Similar simplicity to Obsidian graph view
   * Neutral colors (dark mode preferred)
   * Clean typography
   * No visual clutter

5. Interaction

   * Click node → open/edit idea
   * Drag to reposition (optional override)
   * Zoom in/out smoothly
   * Focus mode (highlight one idea + nearby nodes)

## 🧪 MVP SCOPE

Define a realistic MVP including:

* What features to build first
* What to ignore initially
* How to validate product-market fit quickly

## 🏗️ TECHNICAL ARCHITECTURE

Propose a full stack including:

Frontend:

* Framework (React, etc.)
* Rendering approach (Canvas, SVG, WebGL)
* Animation system (important)

Graph/Orbit Engine:

* How to simulate orbit behavior WITHOUT heavy physics engines
* Efficient layout algorithm

Backend:

* API structure
* Database model for ideas and relationships

AI:

* How to integrate (OpenAI or similar)
* Prompt strategy for idea suggestions

## ⚡ PERFORMANCE

* How to handle hundreds or thousands of nodes
* Optimization strategies
* Rendering techniques

## 🎨 DESIGN SYSTEM

* UI/UX principles
* Motion design guidelines
* How to keep it simple but “wow”

## 🚀 ROADMAP

Break into phases:

* MVP
* V1
* V2

## ⚠️ RISKS

List real technical and product risks and how to mitigate them.

## 🎯 GOAL

The final result should feel like:
"A living system that helps users think, not just store notes"

Be extremely practical and avoid generic advice.
