// JavaScript functionality for KOBEYA Programming School Website
// Modern ES6+ code for interactive features

class KobeyaWebsite {
  constructor() {
    this.initializeOnLoad();
  }

  initializeOnLoad() {
    // Wait for DOM to be ready
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => this.init());
    } else {
      this.init();
    }
  }

  init() {
    console.log('🤖 KOBEYA Programming School - Website Loaded');
    
    // Initialize all features
    this.initMobileMenu();
    this.initFAQ();
    this.initContactForm();
    this.initAnimations();
    this.initFloatingCTA();
    this.initSmoothScroll();
    this.initStatsCounter();
    this.initFormValidation();
    
    // Analytics and tracking (if needed)
    this.initTracking();
  }

  // Mobile Menu Functionality
  initMobileMenu() {
    const menuToggle = document.getElementById('mobile-menu-toggle');
    const mobileMenu = document.getElementById('mobile-menu');
    
    if (menuToggle && mobileMenu) {
      menuToggle.addEventListener('click', () => {
        const isOpen = mobileMenu.classList.contains('hidden');
        
        if (isOpen) {
          mobileMenu.classList.remove('hidden');
          menuToggle.querySelector('i').className = 'fas fa-times text-gray-700';
        } else {
          mobileMenu.classList.add('hidden');
          menuToggle.querySelector('i').className = 'fas fa-bars text-gray-700';
        }
      });

      // Close menu when clicking on links
      mobileMenu.querySelectorAll('a').forEach(link => {
        link.addEventListener('click', () => {
          mobileMenu.classList.add('hidden');
          menuToggle.querySelector('i').className = 'fas fa-bars text-gray-700';
        });
      });
    }
  }

  // FAQ Accordion Functionality
  initFAQ() {
    const faqToggles = document.querySelectorAll('.faq-toggle');
    
    faqToggles.forEach(toggle => {
      toggle.addEventListener('click', () => {
        const content = toggle.nextElementSibling;
        const icon = toggle.querySelector('.fa-chevron-down');
        
        // Close all other FAQ items
        faqToggles.forEach(otherToggle => {
          if (otherToggle !== toggle) {
            const otherContent = otherToggle.nextElementSibling;
            const otherIcon = otherToggle.querySelector('.fa-chevron-down');
            
            otherContent.classList.add('hidden');
            otherToggle.classList.remove('active');
            if (otherIcon) otherIcon.style.transform = 'rotate(0deg)';
          }
        });
        
        // Toggle current FAQ item
        if (content.classList.contains('hidden')) {
          content.classList.remove('hidden');
          toggle.classList.add('active');
          if (icon) icon.style.transform = 'rotate(180deg)';
        } else {
          content.classList.add('hidden');
          toggle.classList.remove('active');
          if (icon) icon.style.transform = 'rotate(0deg)';
        }
      });
    });
  }

  // Contact Form Functionality
  initContactForm() {
    const contactForm = document.getElementById('contact-form');
    
    if (contactForm) {
      contactForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const submitButton = contactForm.querySelector('button[type="submit"]');
        const originalText = submitButton.textContent;
        
        try {
          // Show loading state
          submitButton.classList.add('btn-loading');
          submitButton.disabled = true;
          submitButton.textContent = '送信中...';
          
          // Collect form data
          const formData = new FormData(contactForm);
          const data = Object.fromEntries(formData.entries());
          
          // Collect checkbox values
          const preferredTimes = [];
          contactForm.querySelectorAll('input[name="preferredTime"]:checked').forEach(checkbox => {
            preferredTimes.push(checkbox.value);
          });
          data.preferredTime = preferredTimes;
          
          // Send to API
          const response = await fetch('/api/contact', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(data)
          });
          
          const result = await response.json();
          
          if (result.success) {
            this.showSuccessMessage(result.message);
            contactForm.reset();
          } else {
            throw new Error(result.message || 'エラーが発生しました');
          }
          
        } catch (error) {
          console.error('Form submission error:', error);
          this.showErrorMessage(error.message || 'エラーが発生しました。しばらくしてから再度お試しください。');
        } finally {
          // Reset button state
          submitButton.classList.remove('btn-loading');
          submitButton.disabled = false;
          submitButton.textContent = originalText;
        }
      });
    }
  }

  // Animation Observers
  initAnimations() {
    // Intersection Observer for scroll animations
    const observerOptions = {
      threshold: 0.1,
      rootMargin: '0px 0px -50px 0px'
    };
    
    const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add('fade-in-up');
        }
      });
    }, observerOptions);
    
    // Observe elements that should animate on scroll
    document.querySelectorAll('.card-animation, .stats-animation').forEach(el => {
      observer.observe(el);
    });
  }

  // Floating CTA Behavior
  initFloatingCTA() {
    const floatingCTA = document.getElementById('floating-cta');
    
    if (floatingCTA) {
      let lastScrollY = window.scrollY;
      let ticking = false;
      
      const updateCTA = () => {
        const currentScrollY = window.scrollY;
        
        // Hide CTA when scrolling down, show when scrolling up
        if (currentScrollY > lastScrollY && currentScrollY > 300) {
          floatingCTA.style.transform = 'translateY(100px)';
          floatingCTA.style.opacity = '0';
        } else if (currentScrollY < lastScrollY || currentScrollY <= 300) {
          floatingCTA.style.transform = 'translateY(0)';
          floatingCTA.style.opacity = '1';
        }
        
        lastScrollY = currentScrollY;
        ticking = false;
      };
      
      const requestTick = () => {
        if (!ticking) {
          requestAnimationFrame(updateCTA);
          ticking = true;
        }
      };
      
      window.addEventListener('scroll', requestTick);
      
      // Add transition
      floatingCTA.style.transition = 'transform 0.3s ease, opacity 0.3s ease';
    }
  }

  // Smooth Scroll for Anchor Links
  initSmoothScroll() {
    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
      anchor.addEventListener('click', function (e) {
        const targetId = this.getAttribute('href');
        const targetElement = document.querySelector(targetId);
        
        if (targetElement) {
          e.preventDefault();
          
          targetElement.scrollIntoView({
            behavior: 'smooth',
            block: 'start'
          });
        }
      });
    });
  }

  // Animated Counter for Stats
  initStatsCounter() {
    const statNumbers = document.querySelectorAll('.stat-number');
    
    const animateCounter = (element) => {
      const target = parseInt(element.textContent.replace(/[^\d]/g, ''));
      const increment = target / 50; // 50 steps
      let current = 0;
      
      const updateCounter = () => {
        current += increment;
        if (current < target) {
          element.textContent = Math.floor(current) + (element.textContent.includes('+') ? '+' : '') + (element.textContent.includes('%') ? '%' : '');
          requestAnimationFrame(updateCounter);
        } else {
          element.textContent = target + (element.textContent.includes('+') ? '+' : '') + (element.textContent.includes('%') ? '%' : '');
        }
      };
      
      updateCounter();
    };
    
    // Intersection Observer for stats
    const statsObserver = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          animateCounter(entry.target);
          statsObserver.unobserve(entry.target);
        }
      });
    }, { threshold: 0.5 });
    
    statNumbers.forEach(stat => {
      statsObserver.observe(stat);
    });
  }

  // Form Validation
  initFormValidation() {
    const formInputs = document.querySelectorAll('input[required], select[required], textarea[required]');
    
    formInputs.forEach(input => {
      input.addEventListener('blur', () => this.validateField(input));
      input.addEventListener('input', () => this.clearFieldError(input));
    });
  }

  validateField(field) {
    const value = field.value.trim();
    const fieldType = field.type;
    let isValid = true;
    let errorMessage = '';
    
    // Required field check
    if (field.hasAttribute('required') && !value) {
      isValid = false;
      errorMessage = 'この項目は必須です';
    }
    
    // Email validation
    else if (fieldType === 'email' && value) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(value)) {
        isValid = false;
        errorMessage = '有効なメールアドレスを入力してください';
      }
    }
    
    // Phone validation (basic)
    else if (fieldType === 'tel' && value) {
      const phoneRegex = /^[\d\-\+\(\)\s]+$/;
      if (!phoneRegex.test(value)) {
        isValid = false;
        errorMessage = '有効な電話番号を入力してください';
      }
    }
    
    this.displayFieldValidation(field, isValid, errorMessage);
    return isValid;
  }

  displayFieldValidation(field, isValid, errorMessage) {
    const errorElement = field.parentNode.querySelector('.field-error');
    
    if (isValid) {
      field.classList.remove('form-error');
      field.classList.add('form-success');
      if (errorElement) {
        errorElement.remove();
      }
    } else {
      field.classList.remove('form-success');
      field.classList.add('form-error');
      
      if (!errorElement) {
        const errorDiv = document.createElement('div');
        errorDiv.className = 'field-error text-red-500 text-sm mt-1';
        errorDiv.textContent = errorMessage;
        field.parentNode.appendChild(errorDiv);
      } else {
        errorElement.textContent = errorMessage;
      }
    }
  }

  clearFieldError(field) {
    field.classList.remove('form-error', 'form-success');
    const errorElement = field.parentNode.querySelector('.field-error');
    if (errorElement) {
      errorElement.remove();
    }
  }

  // Success Message Display
  showSuccessMessage(message) {
    const successDiv = document.createElement('div');
    successDiv.className = 'fixed top-4 right-4 bg-green-500 text-white px-6 py-4 rounded-lg shadow-lg z-50 success-message';
    successDiv.innerHTML = `
      <div class="flex items-center space-x-3">
        <i class="fas fa-check-circle text-xl"></i>
        <div>
          <div class="font-semibold">送信完了</div>
          <div class="text-sm">${message}</div>
        </div>
      </div>
    `;
    
    document.body.appendChild(successDiv);
    
    // Remove after 5 seconds
    setTimeout(() => {
      successDiv.style.transform = 'translateX(100%)';
      setTimeout(() => successDiv.remove(), 300);
    }, 5000);
  }

  // Error Message Display
  showErrorMessage(message) {
    const errorDiv = document.createElement('div');
    errorDiv.className = 'fixed top-4 right-4 bg-red-500 text-white px-6 py-4 rounded-lg shadow-lg z-50 error-message';
    errorDiv.innerHTML = `
      <div class="flex items-center space-x-3">
        <i class="fas fa-exclamation-circle text-xl"></i>
        <div>
          <div class="font-semibold">エラー</div>
          <div class="text-sm">${message}</div>
        </div>
      </div>
    `;
    
    document.body.appendChild(errorDiv);
    
    // Remove after 5 seconds
    setTimeout(() => {
      errorDiv.style.transform = 'translateX(100%)';
      setTimeout(() => errorDiv.remove(), 300);
    }, 5000);
  }

  // Analytics and Tracking (placeholder)
  initTracking() {
    // Track CTA clicks
    document.querySelectorAll('a[href="/contact"]').forEach(button => {
      button.addEventListener('click', () => {
        this.trackEvent('CTA_Click', { location: button.textContent.trim() });
      });
    });
    
    // Track external links
    document.querySelectorAll('a[target="_blank"]').forEach(link => {
      link.addEventListener('click', () => {
        this.trackEvent('External_Link', { url: link.href });
      });
    });
  }

  trackEvent(eventName, data) {
    // Analytics implementation would go here
    // For now, just log to console
    console.log('🔍 Event:', eventName, data);
    
    // Example: Google Analytics 4
    // if (typeof gtag !== 'undefined') {
    //   gtag('event', eventName, data);
    // }
  }

  // Utility Functions
  debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
      const later = () => {
        clearTimeout(timeout);
        func(...args);
      };
      clearTimeout(timeout);
      timeout = setTimeout(later, wait);
    };
  }

  throttle(func, limit) {
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
}

// Initialize the website
const kobeyaWebsite = new KobeyaWebsite();

// Export for potential use in other scripts
if (typeof module !== 'undefined' && module.exports) {
  module.exports = KobeyaWebsite;
}