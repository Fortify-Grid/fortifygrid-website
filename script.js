/* ================================================
   FortifyGrid Website JavaScript
   Interactive functionality and animations
   ================================================ */

document.addEventListener('DOMContentLoaded', function() {
    
    // ================================================
    // NAVIGATION
    // ================================================
    
    const navbar = document.getElementById('navbar');
    const mobileMenuToggle = document.getElementById('mobileMenuToggle');
    const navLinks = document.getElementById('navLinks');
    
    // Navbar scroll effect
    function handleNavbarScroll() {
        if (window.scrollY > 50) {
            navbar.classList.add('scrolled');
        } else {
            navbar.classList.remove('scrolled');
        }
    }
    
    window.addEventListener('scroll', handleNavbarScroll);
    
    // Mobile menu toggle
    if (mobileMenuToggle) {
        mobileMenuToggle.addEventListener('click', function() {
            navLinks.classList.toggle('active');
            mobileMenuToggle.classList.toggle('active');
        });
    }
    
    // Close mobile menu when clicking a link
    const navLinkItems = document.querySelectorAll('.nav-links a');
    navLinkItems.forEach(link => {
        link.addEventListener('click', function() {
            navLinks.classList.remove('active');
            mobileMenuToggle.classList.remove('active');
        });
    });
    
    // Close mobile menu when clicking outside
    document.addEventListener('click', function(event) {
        if (!navbar.contains(event.target) && navLinks.classList.contains('active')) {
            navLinks.classList.remove('active');
            mobileMenuToggle.classList.remove('active');
        }
    });
    
    // ================================================
    // SMOOTH SCROLLING
    // ================================================
    
    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
        anchor.addEventListener('click', function(e) {
            e.preventDefault();
            const target = document.querySelector(this.getAttribute('href'));
            if (target) {
                const headerOffset = 80;
                const elementPosition = target.getBoundingClientRect().top;
                const offsetPosition = elementPosition + window.pageYOffset - headerOffset;
                
                window.scrollTo({
                    top: offsetPosition,
                    behavior: 'smooth'
                });
            }
        });
    });
    
    // ================================================
    // STICKY SCROLL FEATURE - OUR APPROACH SECTION
    // ================================================
    
    function initStickyFeature() {
        const stickySection = document.querySelector('.js-sticky-feature');
        if (!stickySection) return;
        
        const contentItems = document.querySelectorAll('.js-sticky-feature__content-item');
        const mediaItems = document.querySelectorAll('.js-sticky-feature__media-item');
        
        if (contentItems.length === 0 || mediaItems.length === 0) return;
        
        // Only run on desktop
        if (window.innerWidth <= 767) {
            // On mobile, show all items
            contentItems.forEach(item => item.classList.add('active'));
            return;
        }
        
        // Set first items as active initially
        contentItems[0].classList.add('active');
        mediaItems[0].classList.add('active');
        
        function handleStickyScroll() {
            if (window.innerWidth <= 767) return;
            
            const viewportMiddle = window.innerHeight / 2;
            let activeIndex = 0;
            
            // Find which content item is at or above viewport middle
            contentItems.forEach((item, index) => {
                const rect = item.getBoundingClientRect();
                if (rect.top <= viewportMiddle) {
                    activeIndex = index;
                }
            });
            
            // Update active states
            contentItems.forEach((item, index) => {
                if (index === activeIndex) {
                    item.classList.add('active');
                } else {
                    item.classList.remove('active');
                }
            });
            
            mediaItems.forEach((item, index) => {
                if (index === activeIndex) {
                    item.classList.add('active');
                } else {
                    item.classList.remove('active');
                }
            });
        }
        
        // Throttled scroll handler
        let ticking = false;
        window.addEventListener('scroll', function() {
            if (!ticking) {
                window.requestAnimationFrame(function() {
                    handleStickyScroll();
                    ticking = false;
                });
                ticking = true;
            }
        });
        
        // Initial check
        handleStickyScroll();
        
        // Handle resize
        window.addEventListener('resize', function() {
            if (window.innerWidth <= 767) {
                contentItems.forEach(item => item.classList.add('active'));
            } else {
                handleStickyScroll();
            }
        });
    }
    
    initStickyFeature();
    
    // ================================================
    // SCROLL ANIMATIONS
    // ================================================
    
    // Add animate-on-scroll class to elements
    const animateElements = document.querySelectorAll(
        '.about-card, .team-card, .content-box, .contact-text, .contact-form-wrapper'
    );
    
    animateElements.forEach(el => {
        el.classList.add('animate-on-scroll');
    });
    
    // Intersection Observer for scroll animations
    const observerOptions = {
        root: null,
        rootMargin: '0px',
        threshold: 0.1
    };
    
    const observer = new IntersectionObserver(function(entries) {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add('animated');
                // Optional: unobserve after animation
                // observer.unobserve(entry.target);
            }
        });
    }, observerOptions);
    
    document.querySelectorAll('.animate-on-scroll').forEach(el => {
        observer.observe(el);
    });
    
    // ================================================
    // SECTION TITLE ANIMATIONS
    // ================================================
    
    const sectionTitles = document.querySelectorAll('.section-title');
    
    const titleObserver = new IntersectionObserver(function(entries) {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.style.opacity = '1';
                entry.target.style.transform = 'translateY(0)';
            }
        });
    }, { threshold: 0.5 });
    
    sectionTitles.forEach(title => {
        title.style.opacity = '0';
        title.style.transform = 'translateY(20px)';
        title.style.transition = 'opacity 0.6s ease-out, transform 0.6s ease-out';
        titleObserver.observe(title);
    });
    
    // ================================================
    // CONTACT FORM
    // ================================================
    
    const contactForm = document.getElementById('contactForm');
    
    if (contactForm) {
        contactForm.addEventListener('submit', function(e) {
            e.preventDefault();
            
            // Get form data
            const formData = new FormData(contactForm);
            const data = Object.fromEntries(formData);
            
            // Validate required fields
            const requiredFields = ['name', 'email', 'message'];
            let isValid = true;
            
            requiredFields.forEach(field => {
                const input = document.getElementById(field);
                if (!data[field] || data[field].trim() === '') {
                    isValid = false;
                    input.style.boxShadow = '0 0 0 2px #EF4B3F';
                } else {
                    input.style.boxShadow = 'none';
                }
            });
            
            // Validate email format
            const emailInput = document.getElementById('email');
            const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
            if (data.email && !emailRegex.test(data.email)) {
                isValid = false;
                emailInput.style.boxShadow = '0 0 0 2px #EF4B3F';
            }
            
            if (isValid) {
                // Show success message
                const submitButton = contactForm.querySelector('.submit-button');
                const originalText = submitButton.textContent;
                
                submitButton.textContent = 'Sending...';
                submitButton.disabled = true;
                
                // Simulate form submission (replace with actual API call)
                setTimeout(() => {
                    submitButton.textContent = 'Message Sent!';
                    submitButton.style.backgroundColor = '#2E6F40';
                    
                    // Reset form
                    contactForm.reset();
                    
                    // Reset button after delay
                    setTimeout(() => {
                        submitButton.textContent = originalText;
                        submitButton.disabled = false;
                        submitButton.style.backgroundColor = '';
                    }, 3000);
                }, 1500);
                
                // Log form data (for development)
                console.log('Form submitted:', data);
                
                // TODO: Replace with actual form submission
                // Example using fetch:
                /*
                fetch('/api/contact', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify(data),
                })
                .then(response => response.json())
                .then(data => {
                    console.log('Success:', data);
                })
                .catch((error) => {
                    console.error('Error:', error);
                });
                */
            }
        });
        
        // Remove error styling on input
        const formInputs = contactForm.querySelectorAll('input, textarea');
        formInputs.forEach(input => {
            input.addEventListener('input', function() {
                this.style.boxShadow = 'none';
            });
            
            input.addEventListener('focus', function() {
                this.style.boxShadow = '0 0 0 2px #2E6F40';
            });
            
            input.addEventListener('blur', function() {
                if (!this.value) {
                    this.style.boxShadow = 'none';
                }
            });
        });
    }
    
    // ================================================
    // PARALLAX EFFECT (SUBTLE)
    // ================================================
    
    const parallaxSections = document.querySelectorAll('.problem-section, .solution-section');
    
    function handleParallax() {
        parallaxSections.forEach(section => {
            const scrolled = window.pageYOffset;
            const sectionTop = section.offsetTop;
            const sectionHeight = section.offsetHeight;
            
            if (scrolled > sectionTop - window.innerHeight && scrolled < sectionTop + sectionHeight) {
                const yPos = (scrolled - sectionTop) * 0.3;
                section.style.backgroundPositionY = `${yPos}px`;
            }
        });
    }
    
    // Only apply parallax on desktop
    if (window.innerWidth > 767) {
        window.addEventListener('scroll', handleParallax);
    }
    
    // ================================================
    // ACTIVE NAV LINK HIGHLIGHTING
    // ================================================
    
    const sections = document.querySelectorAll('section[id]');
    
    function highlightNavOnScroll() {
        const scrollPosition = window.scrollY + 100;
        
        sections.forEach(section => {
            const sectionTop = section.offsetTop;
            const sectionHeight = section.offsetHeight;
            const sectionId = section.getAttribute('id');
            
            if (scrollPosition >= sectionTop && scrollPosition < sectionTop + sectionHeight) {
                document.querySelectorAll('.nav-links a').forEach(link => {
                    link.classList.remove('active');
                    if (link.getAttribute('href') === `#${sectionId}`) {
                        link.classList.add('active');
                    }
                });
            }
        });
    }
    
    window.addEventListener('scroll', highlightNavOnScroll);
    
    // ================================================
    // COUNTER ANIMATION (Optional - for statistics)
    // ================================================
    
    function animateCounter(element, start, end, duration) {
        let startTime = null;
        
        function animation(currentTime) {
            if (startTime === null) startTime = currentTime;
            const timeElapsed = currentTime - startTime;
            const progress = Math.min(timeElapsed / duration, 1);
            const current = Math.floor(progress * (end - start) + start);
            element.textContent = current;
            
            if (progress < 1) {
                requestAnimationFrame(animation);
            }
        }
        
        requestAnimationFrame(animation);
    }
    
    // ================================================
    // LAZY LOADING IMAGES
    // ================================================
    
    const lazyImages = document.querySelectorAll('img[data-src]');
    
    if ('IntersectionObserver' in window) {
        const imageObserver = new IntersectionObserver(function(entries) {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    const img = entry.target;
                    img.src = img.dataset.src;
                    img.removeAttribute('data-src');
                    imageObserver.unobserve(img);
                }
            });
        }, { rootMargin: '100px' });
        
        lazyImages.forEach(img => {
            imageObserver.observe(img);
        });
    } else {
        // Fallback for older browsers
        lazyImages.forEach(img => {
            img.src = img.dataset.src;
        });
    }
    
    // ================================================
    // KEYBOARD NAVIGATION
    // ================================================
    
    document.addEventListener('keydown', function(e) {
        // ESC key closes mobile menu
        if (e.key === 'Escape' && navLinks.classList.contains('active')) {
            navLinks.classList.remove('active');
            mobileMenuToggle.classList.remove('active');
        }
    });
    
    // ================================================
    // PRELOADER (Optional)
    // ================================================
    
    window.addEventListener('load', function() {
        document.body.classList.add('loaded');
        
        // Trigger initial animations
        const heroContent = document.querySelector('.hero-content');
        if (heroContent) {
            heroContent.classList.add('visible');
        }
    });
    
    // ================================================
    // CONSOLE GREETING
    // ================================================
    
    console.log('%c FortifyGrid ', 'background: #2E6F40; color: white; font-size: 20px; padding: 10px;');
    console.log('%c Building the Future of Energy Storage ', 'color: #2E6F40; font-size: 12px;');
    
});

// ================================================
// UTILITY FUNCTIONS
// ================================================

// Debounce function for scroll events
function debounce(func, wait = 10, immediate = true) {
    let timeout;
    return function() {
        const context = this, args = arguments;
        const later = function() {
            timeout = null;
            if (!immediate) func.apply(context, args);
        };
        const callNow = immediate && !timeout;
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
        if (callNow) func.apply(context, args);
    };
}

// Throttle function
function throttle(func, limit) {
    let inThrottle;
    return function() {
        const args = arguments;
        const context = this;
        if (!inThrottle) {
            func.apply(context, args);
            inThrottle = true;
            setTimeout(() => inThrottle = false, limit);
        }
    };
}
