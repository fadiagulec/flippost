/* Creator Vault — Pro gate + hook library renderer.
 * External file because CSP is script-src 'self'.
 * Gate is client-side (content bonus, not an API): a flpt. token in
 * localStorage unlocks; otherwise the locked upsell state shows. */
(function () {
    var isPro = false;
    try {
        var t = localStorage.getItem('flipit_pro') || '';
        isPro = t.indexOf('flpt.') === 0;
    } catch (e) {}

    if (!isPro) {
        document.getElementById('vault').style.display = 'none';
        document.getElementById('locked').style.display = 'block';
        return;
    }

    // 100 hooks, 10 per niche — confront-then-invite style.
    var HOOKS = {
        mommy: [
            "Nobody warns you that the hardest part of motherhood isn't the baby — it's this.",
            "Stop buying toys. Your toddler wants these 3 things and they're all free.",
            "I did bedtime wrong for 2 years. This one change fixed it in 4 nights.",
            "The 5-minute morning trick that ended our daily meltdowns.",
            "You're not a bad mom — you're an under-slept project manager with no staff.",
            "My pediatrician said one sentence that changed how I parent forever.",
            "Everyone tells you to 'enjoy every moment.' Here's what to do instead.",
            "3 things I stopped doing as a mom — and my kids got happier.",
            "The grocery-store tantrum hack that feels illegal to know.",
            "I asked 100 moms their #1 regret. 80 said the same thing."
        ],
        home: [
            "Your house isn't messy — your systems are. Here are the 3 that fix it.",
            "Stop cleaning your shower like that. You're making it dirtier.",
            "The $4 item professional cleaners refuse to work without.",
            "I cleaned my whole kitchen in 12 minutes. Here's the exact order.",
            "You've been loading your dishwasher wrong your entire life.",
            "Landlords hate this: the damage-free fix for every scuffed wall.",
            "The 20-minute Sunday reset that keeps my house guest-ready all week.",
            "3 'clean' things in your home that are dirtier than your toilet.",
            "I stopped folding laundry entirely. My system is better — and faster.",
            "The one drawer rule that ended clutter in my house for good."
        ],
        food: [
            "You're ruining your eggs before the pan even gets hot.",
            "This 15-minute dinner beats your favorite takeout — and costs $4.",
            "Restaurants don't want you to know how easy this actually is.",
            "Stop marinating chicken for hours. 15 minutes + this = better.",
            "The 40g protein breakfast that takes less time than your coffee.",
            "I meal-prepped wrong for years. This method takes 1 hour a week.",
            "One pantry ingredient chefs use that home cooks always skip.",
            "Your pasta water is the secret ingredient you keep pouring away.",
            "3 'healthy' foods quietly wrecking your energy every afternoon.",
            "The knife skill that cuts your dinner prep time in half — tonight."
        ],
        fashion: [
            "You don't need more clothes. You need these 3 formulas.",
            "The $12 tailoring trick that makes cheap clothes look designer.",
            "Stop dressing for your body 'type.' Do this instead.",
            "I wore the same 12 pieces for 30 days. Nobody noticed — everybody complimented.",
            "The one proportion rule stylists use on every single client.",
            "Your outfit isn't boring — it's unfinished. Here's the missing 10%.",
            "Thrifted vs designer: I styled both. Guess which got more compliments.",
            "3 things making your outfits look cheaper than they are.",
            "The color trick that makes any outfit look intentional.",
            "Stop buying trends. Buy these 5 pieces that never age."
        ],
        lifestyle: [
            "Your morning routine isn't the problem. Your night routine is.",
            "I deleted 4 apps and got back 2 hours a day. Here's what I kept.",
            "The 2-minute rule that ended my procrastination spiral.",
            "Everyone romanticizes 5 AM. Here's what actually moved the needle.",
            "3 habits that quietly upgraded my life more than any purchase.",
            "Stop optimizing your calendar. Optimize this instead.",
            "The 'boring' Sunday habit behind every put-together person you know.",
            "I said no to everything for 30 days. Here's what happened.",
            "Your phone isn't the problem. Where you charge it is.",
            "One question I ask every night that changed how I spend my days."
        ],
        beauty: [
            "You're applying skincare in the wrong order — and canceling half of it.",
            "The $9 drugstore product dermatologists actually use themselves.",
            "Stop exfoliating so much. Your 'glow' is a damaged barrier.",
            "I did my makeup in 5 minutes for a month. These 4 products survived.",
            "The one step everyone skips that makes foundation look like skin.",
            "Your concealer isn't creasing because of the concealer.",
            "3 'anti-aging' products that are a waste — and 1 that isn't.",
            "The SPF mistake 90% of you are making before 9 AM.",
            "I asked a makeup artist what she'd cut from my routine. She cut 6 things.",
            "Cheap mascara vs $30 mascara — the test nobody wanted me to run."
        ],
        travel: [
            "Stop planning trips like a tourist. Plan like this instead.",
            "The flight-booking trick that saved me $400 — twice this year.",
            "I packed for 2 weeks in a backpack. Here's the exact list.",
            "3 tourist traps to skip — and what locals do instead.",
            "The airport hack that gets you through security while everyone queues.",
            "You don't need more vacation days. You need this itinerary structure.",
            "The one thing I book FIRST for every trip — and it isn't flights.",
            "Hotel vs Airbnb: the real math nobody shows you.",
            "How I travel every month on a normal salary — the boring truth.",
            "The free app that replaced my travel agent, planner, and map."
        ],
        fitness: [
            "You don't need more motivation. You need a smaller workout.",
            "The 10-minute routine that beat my 60-minute gym sessions.",
            "Stop doing crunches. Your core wants these 3 moves instead.",
            "I trained 12 weeks and everything changed — except the number on the scale.",
            "The protein mistake keeping your workouts from showing.",
            "3 exercises trainers wish you'd stop doing wrong.",
            "Walking is underrated. Here's the exact way I turned it into results.",
            "Your rest days are why you're not progressing — but not how you think.",
            "The gym-anxiety fix nobody talks about: this exact 3-machine circuit.",
            "I asked a physio the #1 thing that wrecks desk workers. It's fixable in 5 min."
        ],
        ai: [
            "You're using AI like a search bar. It's a staff of 10 — here's the org chart.",
            "This one prompt turns ChatGPT into your personal strategist.",
            "Stop paying for 6 AI tools. These 2 free ones do all of it.",
            "I automated 3 hours of my workday with AI. The exact setup:",
            "The AI skill that will matter more than your degree by next year.",
            "Everyone's arguing about AI. Meanwhile, this is what smart people are building.",
            "3 AI tools so good they feel like cheating — all free this month.",
            "The prompt formula behind every viral AI post you've seen.",
            "AI won't take your job. Someone using this workflow will.",
            "I let AI plan my content for 30 days. The results broke my strategy."
        ],
        creator: [
            "Your content isn't bad. Your first second is.",
            "Stop posting more. Post THIS way and grow with 3 posts a week.",
            "The unfollowable mistake 90% of small creators make in their bio.",
            "I studied 100 viral videos. They all do these 3 things in 10 seconds.",
            "Nobody's watching your content because of this — not the algorithm.",
            "The 'boring niche' myth is costing you followers. Here's proof.",
            "Steal this: the exact structure behind every video that hits 1M.",
            "Your views died because you changed this one thing. Change it back.",
            "0 to 10K followers: the 4 posts that did 90% of the work.",
            "Posting daily burned me out and grew nothing. This schedule did."
        ]
    };

    function render() {
        var sections = document.querySelectorAll('[data-hooks]');
        sections.forEach(function (host) {
            var list = HOOKS[host.getAttribute('data-hooks')] || [];
            list.forEach(function (text) {
                var row = document.createElement('div');
                row.className = 'hook';
                var span = document.createElement('span');
                span.textContent = text;
                var btn = document.createElement('button');
                btn.type = 'button';
                btn.textContent = '📋';
                btn.addEventListener('click', function () {
                    navigator.clipboard.writeText(text).then(function () {
                        btn.textContent = '✅';
                        setTimeout(function () { btn.textContent = '📋'; }, 1200);
                    });
                });
                row.appendChild(span);
                row.appendChild(btn);
                host.appendChild(row);
            });
        });
    }
    render();
})();
