document.addEventListener('DOMContentLoaded', function() {
    // Array of image paths - change these to your actual PNG paths
    const imagePaths = [
        'images/image1.png',
        'images/image2.png',
        'images/image3.png',
        'images/image4.png',
        'images/image5.png',
        'images/image6.png',
        'images/image7.png',
        'images/image8.png',
        'images/image9.png',
        'images/image10.png',
        'images/image11.png',
        'images/image12.png',
        'images/image13.png',
        'images/image14.png',
        'images/image15.png',
        'images/image16.png',
        'images/image17.png'

    ];
    
    let currentIndex = 0;
    const galleryView = document.getElementById('gallery-view');
    const imageCounter = document.getElementById('image-counter');
    const prevBtn = document.getElementById('prev-btn');
    const nextBtn = document.getElementById('next-btn');
    
    // Load images into the gallery
    function loadImages() {
        galleryView.innerHTML = '';
        
        imagePaths.forEach((path, index) => {
            const img = document.createElement('img');
            img.src = path;
            img.alt = `Gallery image ${index + 1}`;
            img.classList.add('gallery-image');
            
            if (index === currentIndex) {
                img.classList.add('active-image');
            }
            
            galleryView.appendChild(img);
        });
        
        updateCounter();
    }
    
    // Update the image counter
    function updateCounter() {
        imageCounter.textContent = `Image ${currentIndex + 1} of ${imagePaths.length}`;
    }
    
    // Navigate to the previous image
    function prevImage() {
        currentIndex = (currentIndex - 1 + imagePaths.length) % imagePaths.length;
        updateActiveImage();
    }
    
    // Navigate to the next image
    function nextImage() {
        currentIndex = (currentIndex + 1) % imagePaths.length;
        updateActiveImage();
    }
    
    // Update which image is active
    function updateActiveImage() {
        const images = document.querySelectorAll('.gallery-image');
        images.forEach((img, index) => {
            if (index === currentIndex) {
                img.classList.add('active-image');
            } else {
                img.classList.remove('active-image');
            }
        });
        
        updateCounter();
    }
    
    // Initialize event listeners
    function initEvents() {
        // Button navigation
        prevBtn.addEventListener('click', prevImage);
        nextBtn.addEventListener('click', nextImage);
        
        // Keyboard navigation
        document.addEventListener('keydown', function(e) {
            if (e.key === 'ArrowLeft') {
                prevImage();
            } else if (e.key === 'ArrowRight') {
                nextImage();
            }
        });
        
        // Swipe detection for mobile
        let touchStartX = 0;
        let touchEndX = 0;
        
        galleryView.addEventListener('touchstart', function(e) {
            touchStartX = e.changedTouches[0].screenX;
        }, false);
        
        galleryView.addEventListener('touchend', function(e) {
            touchEndX = e.changedTouches[0].screenX;
            handleSwipe();
        }, false);
        
        function handleSwipe() {
            const swipeThreshold = 50;
            if (touchEndX < touchStartX - swipeThreshold) {
                // Swipe left (next)
                nextImage();
            } else if (touchEndX > touchStartX + swipeThreshold) {
                // Swipe right (previous)
                prevImage();
            }
        }
    }
    
    // Initialize gallery
    loadImages();
    initEvents();
});
