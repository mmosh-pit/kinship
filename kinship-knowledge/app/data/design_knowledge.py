"""Design Knowledge Base — patterns, templates, and composition rules for isometric scene design.

This gets embedded into Pinecone (namespace: kinship-design) alongside the asset catalog
(namespace: kinship-assets). During conversation, both are retrieved semantically so the AI
knows not just WHAT assets exist, but HOW to compose them into great scenes.

Categories:
  - scene_template:    Full scene layout recipes
  - composition:       Asset grouping patterns (which assets go together)
  - zone_pattern:      How to design specific zones within a scene
  - npc_archetype:     NPC personality templates with facet connections
  - challenge_pattern: Therapeutic challenge designs
  - hearts_environment: Which environments support which HEARTS facets
  - layout_principle:  Spatial design rules and tips
  - quest_arc:         Narrative quest structure patterns
  - mood_recipe:       Lighting + weather + asset combos for specific moods
"""

DESIGN_KNOWLEDGE = [

    # ═══════════════════════════════════════════════
    # SCENE TEMPLATES — full layout recipes
    # ═══════════════════════════════════════════════

    {
        "id": "tmpl_forest_sanctuary",
        "category": "scene_template",
        "title": "Forest Sanctuary",
        "facets": ["H", "A"],
        "content": """Forest Sanctuary — A peaceful hidden clearing for harmony and awareness.

Layout (16×16):
- Ground: grass_block_clean everywhere, cobblestone path from (8,14) to (8,8)
- Entry zone (y:12-15): cobblestone path flanked by small_stone, pebbles scattered
- Core zone (y:6-11): stone well at (8,8) as centerpiece. Ring of tree stumps at (6,7), (10,7), (7,10), (9,10)
- Discovery zone (x:0-4, y:0-6): hidden mushroom grove — cluster mushroom_brown, mushroom_red, small flowers
- Boundary: pine trees along all 4 edges, double-thick on north. Hedges fill gaps.

Key objects: stone_well (focal, z=2), campfire (z=1) at (5,9), wooden_bench (z=1) near campfire
Mood: dusk lighting, mist weather. Soft, contemplative.
NPCs: A wise guardian near the well (Awareness), a gentle companion near the campfire (Harmony).
Challenge: "Still Water Meditation" — observe reflections in the well, answer self-reflection prompts."""
    },

    {
        "id": "tmpl_ember_camp",
        "category": "scene_template",
        "title": "Ember Camp — Social Gathering",
        "facets": ["So", "R"],
        "content": """Ember Camp — A warm communal campsite for social connection and resilience.

Layout (16×16):
- Ground: grass_block_clean base, dirt patches around campfire area (7-9, 7-9)
- Entry zone (y:12-15): winding dirt path from (4,14) to (8,10)
- Core zone (y:6-10): large campfire at (8,8). Chopped logs for seating in semicircle: (6,9), (7,10), (9,10), (10,9). Cooking pot nearby.
- Activity zone (x:11-15, y:3-8): training area with wooden_fence posts, target boards
- Rest zone (x:0-5, y:2-6): tent at (3,4), bedroll, lantern

Key objects: campfire (focal, interactive), tent, cooking_pot, wooden_fence, chopped_log
Mood: night lighting, clear weather. Warm firelight glow.
NPCs: A storyteller near the fire (Social), a trainer at the activity area (Resilience).
Challenge: "Campfire Stories" — share a story with the group, listen to others, build empathy. "Obstacle Run" — navigate the training course."""
    },

    {
        "id": "tmpl_zen_garden",
        "category": "scene_template",
        "title": "Zen Garden — Self-Insight Retreat",
        "facets": ["Si", "H"],
        "content": """Zen Garden — A minimalist meditation space for self-knowledge and harmony.

Layout (16×16):
- Ground: stone_tile base, sand patches in center (5-11, 5-11)
- Entry zone (y:12-15): stepping stone path — individual stone tiles at (8,14), (8,13), (7,12), (8,11)
- Core zone (y:5-11): raked sand area (empty tiles). Single large_rock at (8,7) as focal point. Cherry blossom tree at (8,5).
- Meditation spots: stone_bench at (4,8) and (12,8), facing inward
- Boundary: bamboo_hedge on all sides, small_stone scattered at base

Key principle: NEGATIVE SPACE is intentional. Leave the center mostly empty — the emptiness IS the design.
Mood: dawn lighting, clear weather. Serene, spacious.
NPCs: A silent monk (Self-insight) who only speaks when spoken to. Communicates through gestures and short koans.
Challenge: "The Quiet Mind" — sit at a meditation spot, answer 3 reflection prompts about self-awareness without time pressure."""
    },

    {
        "id": "tmpl_village_square",
        "category": "scene_template",
        "title": "Village Square — Community Hub",
        "facets": ["So", "E"],
        "content": """Village Square — A bustling town center for social interaction and empowerment.

Layout (16×16):
- Ground: cobblestone everywhere in center (3-13, 3-13), grass border
- Entry zone: 4 entrances — paths from each edge leading to center
- Core zone: fountain or well at (8,8). Market stalls around it at (5,6), (11,6), (5,10), (11,10)
- Shops zone (north): blacksmith_forge at (6,2), potion_stand at (10,2)
- Gathering zone (south): wooden_bench semicircle, notice_board at (8,12)
- Boundary: wooden_fence with gate openings at each path

Mood: day lighting, clear. Lively, warm, inviting.
NPCs: Merchant (Social — trade and negotiate), Blacksmith (Empowerment — forge your own tools), Town Crier (gives quests).
Challenge: "Market Day" — help 3 NPCs with tasks around the square. "The Forge" — create something meaningful at the blacksmith."""
    },

    {
        "id": "tmpl_mountain_lookout",
        "category": "scene_template",
        "title": "Mountain Lookout — Tenacity Peak",
        "facets": ["T", "R"],
        "content": """Mountain Lookout — A challenging summit for determination and resilience.

Layout (16×16):
- Ground: stone_tile for rocky terrain, grass patches on edges
- Entry zone (y:12-15): steep switchback path — cobblestone zigzag from (2,14) to (8,12) to (14,10) to (8,8)
- Summit zone (y:3-7): flat area at top. Lookout_post at (8,4), flag/banner at (8,3)
- Obstacle zone (y:8-12): scattered large_rock, fallen_log, gaps in path — things to navigate around
- Rest points: wooden_bench at switchback turns (6,13), (12,11)
- Boundary: cliff edges (empty/void on west/east), pine trees on north

Mood: dawn lighting, mist weather. Challenging but rewarding.
NPCs: A veteran climber at the summit (Tenacity — shares wisdom about persistence). A rescue guide at the rest point (Resilience).
Challenge: "The Ascent" — navigate obstacle course from bottom to top. Each obstacle has a reflection prompt about perseverance."""
    },

    # ═══════════════════════════════════════════════
    # COMPOSITION PATTERNS — which assets go together
    # ═══════════════════════════════════════════════

    {
        "id": "comp_campfire_circle",
        "category": "composition",
        "title": "Campfire Gathering Circle",
        "facets": ["So", "H"],
        "content": """Campfire gathering circle — a warm social focal point.

Assets needed: campfire (center), chopped_log or wooden_bench (seating), cooking_pot (optional)
Layout: Place campfire at center position. Arrange 3-5 seating objects in semicircle 1-2 tiles away.
Spacing: Leave 1 empty tile between campfire and seats for player movement.
Z-ordering: campfire z=1, seats z=1, all on objects layer.

Example at (8,8):
  campfire → (8,8) z=1
  log → (6,9) z=1, (7,10) z=1, (9,10) z=1, (10,9) z=1
  cooking_pot → (9,7) z=1

Emotional purpose: Creates warmth and belonging. Players naturally gather here. Perfect for Social + Harmony facets.
NPC placement: Position a storyteller or companion NPC on one of the seats."""
    },

    {
        "id": "comp_meditation_spot",
        "category": "composition",
        "title": "Meditation Spot",
        "facets": ["Si", "A"],
        "content": """Meditation spot — a quiet corner for self-reflection.

Assets needed: stone_bench or cushion (seating), mushrooms or flowers (accent), candle or lantern (lighting)
Layout: Place seating facing inward toward an empty 2×2 space. Surround with small decorative objects.
Key: Leave the CENTER empty — the negative space is where the meditation happens.

Example at (4,4):
  stone_bench → (4,5) z=1 (facing north)
  mushroom_brown → (3,3) z=1, (5,3) z=1
  small_flower → (3,4) z=1, (5,4) z=1
  lantern → (4,3) z=1

Emotional purpose: Creates a sense of stillness and introspection. Away from main paths.
Best placed in corners or edges of the scene, not at the center (that's for focal points)."""
    },

    {
        "id": "comp_forest_border",
        "category": "composition",
        "title": "Dense Forest Border",
        "facets": [],
        "content": """Forest border — natural boundary using trees and undergrowth.

Assets needed: pine_tree or oak_tree (tall), bush or hedge (medium), mushroom or pebbles (ground)
Layout: Double row of trees along edge. Fill gaps with bushes. Scatter mushrooms at base.

For north border (y=0-1):
  Row 1 (y=0): pine_tree at every other x → (0,0), (2,0), (4,0)... z=3
  Row 2 (y=1): pine_tree offset → (1,1), (3,1), (5,1)... z=3
  Bushes in remaining gaps z=2
  Mushrooms scattered at z=1

For side borders: same pattern rotated.
Leave openings (2-3 tile gaps) where paths enter the scene.

Design purpose: Creates natural containment without walls. Gives depth and visual density.
The overlapping trees at z=3-4 create a canopy effect player walks behind."""
    },

    {
        "id": "comp_path_system",
        "category": "composition",
        "title": "Path System — Cobblestone Walkways",
        "facets": [],
        "content": """Path system — visual guides for player movement using ground tile variations.

Use ground_patches to create paths on top of the base ground_fill.

Main path: 2 tiles wide, connecting entry (bottom) to focal point (center).
Branch paths: 1 tile wide, leading from main path to side areas.

Example main path from entry to center:
  ground_patches: [{"asset_name": "cobblestone_01", "positions": [[7,14],[8,14],[7,13],[8,13],[7,12],[8,12],...,[7,8],[8,8]]}]

Branch to side area:
  ground_patches: [{"asset_name": "dirt_path_01", "positions": [[6,10],[5,10],[4,10],[4,9],[4,8]]}]

Place small_stone or pebbles along path edges (z=1) for visual definition.
Paths should CURVE slightly — avoid perfectly straight lines for organic feel.
Use different tile types for path hierarchy: cobblestone (main), dirt (secondary), stepping stones (discovery)."""
    },

    {
        "id": "comp_well_plaza",
        "category": "composition",
        "title": "Well Plaza — Self-Reflection Centerpiece",
        "facets": ["Si", "A"],
        "content": """Well plaza — a central feature for reflection and awareness.

Assets needed: stone_well (center, z=2), cobblestone ground, small_stone border, benches
Layout: Well at exact center. 3×3 cobblestone plaza around it. Stone border ring. 2 benches facing well.

Example at center (8,8):
  stone_well → (8,8) z=2 (focal point, interactive)
  Cobblestone ground_patch: (7,7) to (9,9) — 9 tiles
  small_stone border: (6,7), (6,8), (6,9), (10,7), (10,8), (10,9), (7,6), (8,6), (9,6), (7,10), (8,10), (9,10)
  stone_bench → (6,8) z=1 facing east, (10,8) z=1 facing west

Emotional purpose: Wells symbolize depth, hidden knowledge, looking inward. Perfect for Self-insight.
NPC: Place a guardian or oracle near the well who asks reflective questions.
Challenge: "What Lies Beneath" — look into the well, answer prompts about self-discovery."""
    },

    # ═══════════════════════════════════════════════
    # NPC ARCHETYPES
    # ═══════════════════════════════════════════════

    {
        "id": "npc_wise_guardian",
        "category": "npc_archetype",
        "title": "The Wise Guardian",
        "facets": ["A", "Si"],
        "content": """The Wise Guardian — a calm, knowing figure who guides through questions.

Personality: Patient, observant, speaks in metaphors. Never gives direct answers — asks questions that lead to insight.
Role: Guardian of a focal point (well, shrine, ancient tree).
Dialogue style: Slow, thoughtful. Short sentences. Uses nature metaphors. "The river doesn't push the stones — it flows around them."
Catchphrases: "What do you see when you look within?", "The answer is already inside you.", "Listen to the silence."
Facet: Awareness or Self-insight.
Position: Near the scene's centerpiece object. Faces the player.
Design contrast: Pair with a playful/energetic NPC to balance the mood.

Challenge tie-in: Meditation or observation challenges. "What did you notice about X?" questions.
Emotional arc: Initially cryptic → warms up as player engages → reveals deeper wisdom."""
    },

    {
        "id": "npc_playful_companion",
        "category": "npc_archetype",
        "title": "The Playful Companion",
        "facets": ["So", "H"],
        "content": """The Playful Companion — an energetic, warm friend who makes everything fun.

Personality: Enthusiastic, curious, slightly mischievous. Turns tasks into games. Celebrates small wins loudly.
Role: Companion who follows the player or hangs out at gathering spots.
Dialogue style: Excitable, uses exclamation marks. Asks "what if" questions. Makes up silly names for things.
Catchphrases: "Ooh, let's try THIS!", "You're doing amazing!", "Quick, come look at what I found!"
Facet: Social or Harmony.
Position: Near campfire, garden, or any social gathering area. Moves between spots.
Design contrast: Pair with a serious/wise NPC. The companion lightens the mood.

Challenge tie-in: Social tasks, treasure hunts, cooperative games.
Emotional arc: Initially meets player with excitement → shares vulnerabilities during quieter moments → teaches that joy is strength."""
    },

    {
        "id": "npc_grumpy_mentor",
        "category": "npc_archetype",
        "title": "The Grumpy Mentor",
        "facets": ["T", "R"],
        "content": """The Grumpy Mentor — tough love disguised as complaints, teaches resilience through challenge.

Personality: Blunt, seemingly irritable, but deeply caring underneath. Sets high standards.
Role: Trainer or taskmaster at a forge, training ground, or workshop.
Dialogue style: Short, gruff sentences. Backhanded compliments. "Not terrible. Do it again."
Catchphrases: "Again.", "Pain is just weakness leaving.", "I've seen worse. Not much worse, but worse."
Facet: Tenacity or Resilience.
Position: Near training equipment, forge, or obstacle course.
Design contrast: Hidden soft side revealed through quest progression.

Challenge tie-in: Physical/skill challenges with retry mechanics. Each failure gets encouraging grumbles.
Emotional arc: Dismissive → grudging respect → reveals they push hard because they believe in the player."""
    },

    {
        "id": "npc_mysterious_trickster",
        "category": "npc_archetype",
        "title": "The Mysterious Trickster",
        "facets": ["A", "T"],
        "content": """The Mysterious Trickster — appears and disappears, challenges assumptions.

Personality: Enigmatic, speaks in riddles, appears where least expected. Not malicious — trickery serves growth.
Role: Appears at discovery zones, hidden corners, unexpected places.
Dialogue style: Riddles, reversed logic, Socratic questions. "What if up is down and the answer is the question?"
Catchphrases: "Look again.", "Are you sure?", "The obvious path is rarely the right one."
Facet: Awareness or Tenacity.
Position: Hidden spots — behind trees, in corners, appears after player explores.
Design contrast: Pair with a straightforward NPC so the trickster's mystery stands out.

Challenge tie-in: Puzzle challenges, observation tests, "find the hidden X" tasks.
Emotional arc: Confusing → intriguing → player realizes the trickster was teaching all along."""
    },

    {
        "id": "npc_nurturing_healer",
        "category": "npc_archetype",
        "title": "The Nurturing Healer",
        "facets": ["H", "E"],
        "content": """The Nurturing Healer — warmth, care, and unconditional acceptance.

Personality: Gentle, empathetic, creates safe spaces. Validates emotions. Never judges.
Role: Caretaker of a garden, healing spring, or rest area.
Dialogue style: Warm, affirming. "It's okay to feel that way.", uses inclusive language. Offers comfort.
Catchphrases: "How are you really feeling?", "You're safe here.", "Let me make you some tea."
Facet: Harmony or Empathy.
Position: Near garden, healing spring, kitchen, or cozy area with soft lighting.
Design contrast: Pair with a more challenging NPC (mentor, trickster).

Challenge tie-in: Emotional expression tasks, caring for plants/animals, cooking together.
Emotional arc: Welcoming → shares own struggles → teaches that vulnerability is strength."""
    },

    # ═══════════════════════════════════════════════
    # CHALLENGE PATTERNS
    # ═══════════════════════════════════════════════

    {
        "id": "ch_still_water_meditation",
        "category": "challenge_pattern",
        "title": "Still Water Meditation",
        "facets": ["A", "Si"],
        "content": """Still Water Meditation — a mindfulness challenge near a well or water feature.

Structure:
  Step 1: Approach the well. NPC says "Look into the water. What do you see?"
  Step 2: Answer a self-reflection prompt: "Name one thing you're grateful for right now."
  Step 3: "Now look deeper. What emotion are you carrying today?"
  Step 4: "Let the water hold it for you. Take three deep breaths."

Difficulty: Easy. No time pressure. No wrong answers.
Scoring: Awareness +3, Self-insight +2 for completion. Bonus +1 for detailed responses.
Success criteria: Complete all 4 steps and respond thoughtfully (detected by NPC dialogue AI).
Objects needed: stone_well (interactive), ambient mist/particles, quiet area.
Time limit: None.

Design principle: Therapeutic, not gamified. No points displayed. Progress shown through NPC warmth.
Failure mode: There is no failure. If player says "I don't know", NPC gently encourages."""
    },

    {
        "id": "ch_campfire_stories",
        "category": "challenge_pattern",
        "title": "Campfire Stories",
        "facets": ["So", "E"],
        "content": """Campfire Stories — a social sharing challenge around a campfire.

Structure:
  Step 1: Join the campfire circle. NPC says "We're sharing stories tonight. Want to listen first?"
  Step 2: Listen to NPC share a story about overcoming a fear. Option to ask follow-up.
  Step 3: "Your turn! Share a time you felt brave, even if it was small."
  Step 4: Group responds positively. NPC reflects: "Courage comes in all sizes."

Difficulty: Medium. Requires emotional engagement but no "correct" answer.
Scoring: Social +3, Empathy +2. Bonus for asking the NPC follow-up questions.
Success criteria: Share a personal story and engage with the NPC's story.
Objects needed: campfire, seating (logs/benches), 2+ NPCs to create "group" feel.
Time limit: None.

Design principle: Reciprocal sharing. NPC goes first to model vulnerability.
Failure mode: Player can choose to "just listen" — still gets partial credit for attendance."""
    },

    {
        "id": "ch_obstacle_course",
        "category": "challenge_pattern",
        "title": "The Obstacle Course",
        "facets": ["T", "R"],
        "content": """The Obstacle Course — a physical/spatial challenge testing persistence.

Structure:
  Step 1: Mentor NPC explains: "Three obstacles. You'll probably fall. That's the point."
  Step 2: Navigate around/through 3 obstacles (rocks, logs, fences). Each has a prompt.
  Step 3: At each obstacle: "This represents [fear/doubt/frustration]. How do you push through?"
  Step 4: Reach the end. Mentor: "You didn't quit. That's what matters."

Difficulty: Medium-Hard. 3 steps with increasing difficulty.
Scoring: Tenacity +3, Resilience +2. Each retry of an obstacle gives +0.5 Resilience.
Success criteria: Complete all 3 obstacles. Attempts matter more than speed.
Objects needed: large_rock, fallen_log, wooden_fence as obstacles. Clear path between them.
Time limit: 120 seconds (generous). Timer adds gentle urgency, not stress.

Design principle: Failure is REWARDED (resilience points). The lesson is persistence, not perfection.
Track: 5-6 tiles long with obstacles at positions 2, 4, 6."""
    },

    {
        "id": "ch_hidden_treasures",
        "category": "challenge_pattern",
        "title": "Hidden Treasures Hunt",
        "facets": ["A", "T"],
        "content": """Hidden Treasures — an exploration challenge rewarding careful observation.

Structure:
  Step 1: Trickster NPC: "There are 5 hidden objects in this scene. Can you find them?"
  Step 2: Player explores scene. Hidden objects glow faintly when player is within 2 tiles.
  Step 3: Each found object has a clue/riddle leading to the next.
  Step 4: Finding all 5 reveals a "hidden truth" — a meaningful quote or reflection.

Difficulty: Easy-Medium. No combat, just observation.
Scoring: Awareness +2 per object found. Tenacity +1 for completing all 5.
Success criteria: Find at least 3 of 5 objects.
Objects needed: 5 small objects placed in non-obvious locations (behind trees, in corners, at edge of paths).
Time limit: 300 seconds. Plenty of time.

Design principle: Rewards curiosity and attention to detail. Each object has meaning.
Placement: Hidden objects at (2,2), (13,3), (1,12), (14,11), (8,1) — corners and edges."""
    },

    # ═══════════════════════════════════════════════
    # HEARTS-ENVIRONMENT MAPPINGS
    # ═══════════════════════════════════════════════

    {
        "id": "hearts_harmony",
        "category": "hearts_environment",
        "title": "Harmony Environments",
        "facets": ["H"],
        "content": """Environments that support Harmony (H) — balance, peace, inner alignment.

Best scene types: garden, forest clearing, lakeside, zen garden, treehouse
Lighting: dusk or dawn (transitional light = balance). Avoid harsh midday.
Weather: mist or clear. Rain is okay if gentle.
Color palette: Greens, soft blues, earth tones. No harsh reds or bright yellows.

Key assets: water features (well, pond, fountain), natural seating (stone bench, log), soft plants (flowers, moss, ferns)
Avoid: busy/cluttered layouts, many NPCs, loud objects (forge, training equipment)

Layout principles:
- Symmetry suggests balance. Mirror elements left-right around center axis.
- Flowing curves, not sharp angles. Paths should meander.
- Generous negative space. Don't fill every tile.
- Single clear focal point (well, tree, shrine) at center.

NPC fit: Wise Guardian, Nurturing Healer. Calm, measured personalities.
Challenge fit: Meditation, breathing exercises, nature observation, gratitude practices."""
    },

    {
        "id": "hearts_social",
        "category": "hearts_environment",
        "title": "Social Environments",
        "facets": ["So"],
        "content": """Environments that support Social (So) — connection, empathy, community.

Best scene types: village square, campsite, community garden, market, tavern
Lighting: night with warm firelight, or bright day. Social scenes need warmth.
Weather: clear. Rain only if cozy (under shelter).
Color palette: Warm oranges, yellows, rich browns. Firelight colors.

Key assets: campfire, seating in circles/semicircles, tables, cooking areas, shared workspaces
Critical: Multiple seating positions facing CENTER — creates gathering feeling.

Layout principles:
- Circular or semicircular arrangements around a social focal point.
- Multiple NPCs visible at once. At least 2, ideally 3.
- Paths converge toward the center (people coming together).
- Activity zones near social area (cooking, crafting, playing).

NPC fit: Playful Companion, Storyteller, Merchant. Outgoing, talkative personalities.
Challenge fit: Cooperative tasks, storytelling, trading, group activities, helping NPCs."""
    },

    {
        "id": "hearts_resilience",
        "category": "hearts_environment",
        "title": "Resilience Environments",
        "facets": ["R"],
        "content": """Environments that support Resilience (R) — recovery, adaptability, strength.

Best scene types: mountain, rebuilding site, storm-weathered forest, forge, training ground
Lighting: dawn (new beginnings) or overcast. Post-storm feeling.
Weather: clearing rain, wind. Something that suggests "we made it through."
Color palette: Storm greys transitioning to warm colors. Contrast between damage and regrowth.

Key assets: broken/cracked objects alongside repaired ones, rebuilding materials, tools, training equipment
Narrative: The environment should show EVIDENCE of past struggle AND recovery.

Layout principles:
- Contrast zones: damaged area (fallen trees, cracked stones) → restored area (new growth, repaired structures).
- Journey from struggle to strength — entry in damaged zone, path to restored zone.
- Rest points along the way (bench, shelter).
- Something being rebuilt or maintained (NPC actively working).

NPC fit: Grumpy Mentor, Veteran Guide. Characters who've survived hardship.
Challenge fit: Obstacle courses with retry mechanics, rebuilding tasks, persistence tests."""
    },

    {
        "id": "hearts_awareness",
        "category": "hearts_environment",
        "title": "Awareness Environments",
        "facets": ["A"],
        "content": """Environments that support Awareness (A) — mindfulness, perception, presence.

Best scene types: forest, garden, observatory, ancient ruins, misty lake
Lighting: dawn or dusk. Transitional light encourages noticing changes.
Weather: mist is PERFECT. Fog reveals and conceals. Clear night with stars also works.
Color palette: Soft, muted. No bright or loud colors. Subtle variations.

Key assets: small hidden details (mushrooms, gems, footprints), wind chimes, water features, varied vegetation
Critical: Include DETAILS that reward careful observation — small objects partially hidden.

Layout principles:
- Layer visual depth. Many z-layers with objects at different depths.
- Hide small rewards in unexpected places (corner mushroom, beetle on a log).
- Paths that invite exploration — forking paths, partially hidden side routes.
- Sound cues (implied): wind chimes, water, rustling leaves.

NPC fit: Mysterious Trickster, Wise Guardian. Characters who notice what others miss.
Challenge fit: Observation tests, hidden object searches, "what's different" games, mindful walking."""
    },

    {
        "id": "hearts_tenacity",
        "category": "hearts_environment",
        "title": "Tenacity Environments",
        "facets": ["T"],
        "content": """Environments that support Tenacity (T) — determination, grit, follow-through.

Best scene types: mountain peak, obstacle course, forge, long trail, construction site
Lighting: harsh day or dramatic sunset. Bold, challenging light.
Weather: wind, light rain (not comfortable — that's the point).
Color palette: Strong contrasts. Dark rock against bright sky.

Key assets: obstacles (rocks, logs, fences), height changes, goal markers (flag, beacon), path with clear checkpoints
Critical: The scene should have a VISIBLE GOAL — something at the "top" or "end" that the player can see but hasn't reached yet.

Layout principles:
- Clear start and end points. Player can see the destination from the beginning.
- Progressive difficulty — obstacles get harder/closer together as player advances.
- Checkpoints with rest areas (benches, shelters) to acknowledge progress.
- Visual reward at the end (panoramic view, flag, treasure).

NPC fit: Grumpy Mentor, Coach figure. Someone who pushes but believes.
Challenge fit: Timed courses, multi-step tasks, "try again" mechanics, endurance tests."""
    },

    {
        "id": "hearts_selfinsight",
        "category": "hearts_environment",
        "title": "Self-Insight Environments",
        "facets": ["Si"],
        "content": """Environments that support Self-insight (Si) — self-knowledge, reflection, growth.

Best scene types: well chamber, mirror room, journal nook, ancient library, solo grove
Lighting: soft indoor lighting or moonlight. Intimate, personal.
Weather: clear night or gentle rain (introspective mood).
Color palette: Deep purples, midnight blues, warm amber accents.

Key assets: wells (looking inward), mirrors, journals/books, personal artifacts, candles/lanterns
Critical: Create a sense of PRIVACY. The player should feel alone and safe here.

Layout principles:
- Small, contained spaces. Not wide open — cozy and intimate.
- Single player focus (not a social space). 1 NPC maximum.
- Reflective surfaces symbolically (water, polished stone).
- Personal objects the player might identify with.

NPC fit: Wise Guardian (solo), Silent Observer. Characters who listen more than speak.
Challenge fit: Self-reflection prompts, journaling exercises, "choose your path" decisions, identity questions."""
    },

    # ═══════════════════════════════════════════════
    # LAYOUT PRINCIPLES
    # ═══════════════════════════════════════════════

    {
        "id": "layout_visual_flow",
        "category": "layout_principle",
        "title": "Visual Flow — Guiding the Player's Eye",
        "facets": [],
        "content": """Visual flow — how to guide the player's eye through an isometric scene.

The player's eye enters from the BOTTOM (spawn point) and should be drawn toward the CENTER (focal point).

Techniques:
1. PATH CONTRAST: Use different ground tiles (cobblestone on grass) to create visual paths.
2. SIZE GRADIENT: Smaller objects at edges, larger focal point at center.
3. COLOR CONTRAST: Bright/warm objects at focal point, muted objects at edges.
4. CONVERGING LINES: Paths and object rows should point toward center.
5. NEGATIVE SPACE: Empty areas around the focal point make it stand out.

Bad example: Objects scattered randomly with no visual hierarchy → player doesn't know where to look.
Good example: Path leads from (8,14) to campfire at (8,8), flanked by trees that frame the campfire.

The spawn point should FACE the focal point. If spawn is at (8,14) facing north, the focal point should be north of it."""
    },

    {
        "id": "layout_zone_design",
        "category": "layout_principle",
        "title": "Zone Design — Dividing Space into Purpose Areas",
        "facets": [],
        "content": """Zone design — how to create distinct purpose areas within a 16×16 grid.

Standard 4-zone layout:
1. ENTRY ZONE (y: 12-15, 4 rows): Where the player arrives. Path, first impression, orientation.
2. CORE ZONE (y: 6-11, 6 rows): Main activity area. Focal point, NPCs, primary interactions.
3. DISCOVERY ZONE (sides/corners): Secondary content. Hidden items, side NPCs, bonus challenges.
4. BOUNDARY (edges, 1-2 rows): Dense vegetation/objects to contain the space naturally.

Zone relationships:
- Entry should have a clear path TOWARD core (don't block with objects).
- Core should have the most visual interest and interactive objects.
- Discovery zones should feel like you "found" them — partially hidden by trees or offset from main path.
- Boundary should be visually dense but not feel like walls.

Grid allocation on a 16×16:
  Boundary: rows 0-1 (north), rows 14-15 (south), cols 0-1 (west), cols 14-15 (east)
  Entry: rows 12-13 (inside south boundary)
  Core: rows 5-11 (largest area)
  Discovery: corners (0-4,0-4), (12-15,0-4), etc."""
    },

    {
        "id": "layout_z_ordering",
        "category": "layout_principle",
        "title": "Z-Ordering — Creating Visual Depth",
        "facets": [],
        "content": """Z-ordering — how to use z_index for proper isometric depth.

Layers:
  z=0: Ground tiles. ALWAYS present at every (x,y). Use ground_fill.
  z=1: Ground-level objects. Mushrooms, pebbles, small flowers, flat items.
  z=2: Medium objects. Benches, stumps, wells, campfires, fences.
  z=3: Tall objects. Trees, large rocks, structures. Player walks BEHIND these.
  z=4: Canopy. Tree tops, overhanging branches. Creates depth when player walks under.

Rules:
- Objects with HIGHER y values should render IN FRONT of lower y objects at the same z.
  (In isometric, higher y = closer to camera.)
- Trees at the TOP of the scene (low y) should be z=3 so player walks in front of their trunks.
- Objects at the BOTTOM of the scene (high y) should be z=1-2 so they don't block the view.
- Use z=4 sparingly — only for canopy effects where player passes underneath.

Common mistakes:
- All objects at the same z_index → flat, no depth.
- Trees at z=1 → player appears behind trees, looks wrong.
- Ground objects at z=2 → small mushroom appears in front of a bench."""
    },

    # ═══════════════════════════════════════════════
    # QUEST ARC PATTERNS
    # ═══════════════════════════════════════════════

    {
        "id": "quest_intro_reflection",
        "category": "quest_arc",
        "title": "Introduction → Challenge → Reflection Arc",
        "facets": [],
        "content": """Standard 3-beat quest arc for Kinship scenes.

Beat 1 — INTRODUCTION: Player enters scene, meets NPC, learns context.
  "Welcome, traveler. This grove has been quiet for many seasons..."
  Purpose: Set emotional context, build NPC relationship.
  Score: Minimal HEARTS points. This is setup.

Beat 2 — CHALLENGE: Player engages with the scene's main activity.
  This is the core gameplay — meditation, obstacle, social task, exploration.
  Purpose: Active engagement with the facet theme.
  Score: Main HEARTS points awarded here.

Beat 3 — REFLECTION: Post-challenge debrief with NPC.
  "You did well. What did you learn about yourself?"
  Purpose: Integrate the experience. Emotional takeaway.
  Score: Bonus HEARTS for thoughtful reflection responses.

The arc should take 5-10 minutes. Each beat has its own area in the scene:
- Introduction: Entry zone
- Challenge: Core zone
- Reflection: A quiet spot (bench, well, garden) separate from the challenge area"""
    },

    {
        "id": "quest_discovery_arc",
        "category": "quest_arc",
        "title": "Discovery → Connection → Transformation Arc",
        "facets": ["A", "So"],
        "content": """Discovery quest arc — explore, connect, and grow.

Beat 1 — DISCOVERY: Player explores the scene freely. No quest markers. Just curiosity.
  "Something feels different about this place. Look around..."
  Hidden objects, environmental storytelling, clues that build a picture.

Beat 2 — CONNECTION: Discovery leads to an NPC or revelation.
  Finding all clues triggers an NPC appearance or reveals a hidden area.
  "You found all the markers. You see what others miss."
  Player connects the pieces and understands the scene's story.

Beat 3 — TRANSFORMATION: The scene changes or a new area opens.
  Mist clears, a door opens, an NPC transforms, lighting changes from dusk to dawn.
  The physical change mirrors the emotional insight.

This arc rewards patience and observation over speed.
Best for: Awareness, Self-insight, Social (discovering others' stories)."""
    },

    # ═══════════════════════════════════════════════
    # MOOD RECIPES
    # ═══════════════════════════════════════════════

    {
        "id": "mood_peaceful_contemplation",
        "category": "mood_recipe",
        "title": "Peaceful Contemplation Mood",
        "facets": ["H", "A", "Si"],
        "content": """Recipe for peaceful contemplation mood.

Lighting: dusk
Weather: mist
Ground: grass with scattered stepping stones
Density: LOW (30-40% tile coverage). Lots of open space.
Colors: Muted greens, soft purples, amber lantern glow.

Assets: stone_well, lantern, mushrooms, ferns, stone_bench, single_tree (not forest)
Asset count: 15-20 objects (keep it minimal)
Sound (implied): Gentle water, distant wind, occasional bird

Avoid: bright objects, multiple NPCs, clustered assets, training equipment, fences
Keep: Negative space, gentle curves, single focal point, 1 NPC max"""
    },

    {
        "id": "mood_warm_social",
        "category": "mood_recipe",
        "title": "Warm Social Mood",
        "facets": ["So", "H"],
        "content": """Recipe for warm social gathering mood.

Lighting: night
Weather: clear
Ground: mix of grass and dirt, worn paths showing frequent use
Density: MEDIUM-HIGH (50-60% coverage). Lived-in, busy but not cluttered.
Colors: Warm oranges, amber, golden firelight. Rich browns.

Assets: campfire (essential), logs/benches in circle, cooking_pot, tent, lanterns, wooden_table
Asset count: 25-35 objects (busy, lived-in)
Sound (implied): Crackling fire, distant conversation, cooking sounds

Critical: Seating must face CENTER. At least 3 seating positions. 2+ NPCs visible.
Avoid: cold/sterile layouts, isolated spots, harsh lighting"""
    },

    {
        "id": "mood_challenging_dramatic",
        "category": "mood_recipe",
        "title": "Challenging & Dramatic Mood",
        "facets": ["T", "R"],
        "content": """Recipe for challenging, dramatic mood.

Lighting: dawn or harsh day
Weather: wind or clearing rain
Ground: stone/rocky base, broken cobblestone, dirt patches
Density: MEDIUM (40-50%). Open spaces feel exposed, clusters feel like obstacles.
Colors: Dark greys, slate, with bright accent at the goal (gold flag, warm firelight).

Assets: large_rock, fallen_log, broken_fence, steep_path markers, flag/banner at summit
Asset count: 20-30 objects. Obstacles spaced for movement between.
Sound (implied): Wind, distant thunder, footsteps on stone

Layout: Clear direction from bottom to top. Obstacles in the way. Goal visible at the top.
Avoid: cozy elements, comfortable seating, flowers, gentle lighting"""
    },
]
