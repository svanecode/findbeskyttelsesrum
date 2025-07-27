# Next.js Asset Caching Strategy

This document explains how this Next.js project is configured for optimal static asset caching with hashed filenames.

## Overview

The project uses a comprehensive caching strategy that ensures:
- ✅ Content-based hashed filenames for all static assets
- ✅ Long-term caching (1 year) for hashed assets
- ✅ No query string cache busting needed
- ✅ Previous assets remain cached indefinitely
- ✅ Dynamic content is never cached

## How It Works

### 1. Hashed Filenames
Next.js automatically generates content-based hashes for all static assets during build:
- JavaScript bundles: `/_next/static/chunks/[hash].js`
- CSS files: `/_next/static/css/[hash].css`
- Images: `/_next/image/[hash]`
- Other assets: `/_next/static/[hash]/[filename]`

### 2. Caching Headers
Two layers of caching configuration:

#### Next.js Configuration (`next.config.js`)
- Sets headers for `/_next/static/*` assets
- Configures caching for public directory assets
- Handles service worker caching

#### Vercel Configuration (`vercel.json`)
- Provides edge-level caching headers
- Ensures consistent caching across all deployments
- Handles API route caching

### 3. Cache Strategy

| Asset Type | Cache Duration | Headers |
|------------|----------------|---------|
| Hashed JS/CSS | 1 year | `public, max-age=31536000, immutable` |
| Images | 1 year | `public, max-age=31536000, immutable` |
| Static files | 1 year | `public, max-age=31536000, immutable` |
| Service worker | No cache | `public, max-age=0, must-revalidate` |
| API routes | No cache | `no-cache, no-store, must-revalidate` |
| Dynamic pages | No cache | `no-cache, no-store, must-revalidate` |

## Verification

### 1. Build and Check Assets
```bash
npm run build
npm run verify-assets
```

### 2. Manual Verification
After building, check the `.next/static` directory:
```bash
ls -la .next/static/
```

You should see files with hashed names like:
- `chunks/12345678.js`
- `css/abcdef12.css`
- `12345678/static/image.png`

### 3. Browser Verification
1. Open browser dev tools
2. Go to Network tab
3. Load your site
4. Check that static assets have:
   - Hashed filenames
   - `Cache-Control: public, max-age=31536000, immutable` headers

## Deployment Testing

### 1. First Deployment
1. Deploy your app
2. Note the hashed filenames in browser dev tools
3. Verify caching headers are present

### 2. Content Change Test
1. Make a small change to your code
2. Redeploy
3. Check that:
   - New hashed filenames are generated
   - Old assets are still cached (check Network tab)
   - New content loads correctly

### 3. Cache Validation
1. Open browser dev tools
2. Go to Application > Storage > Cache Storage
3. Verify that old assets remain cached
4. New assets are fetched with new hashes

## Benefits

### Performance
- **Faster loading**: Cached assets load instantly
- **Reduced bandwidth**: Only new/changed assets are downloaded
- **Better Core Web Vitals**: Improved LCP and FID scores

### User Experience
- **Instant navigation**: Cached assets don't need re-downloading
- **Offline capability**: Service worker can serve cached assets
- **Consistent performance**: Predictable loading times

### SEO
- **Better page speed**: Faster loading improves search rankings
- **Mobile optimization**: Reduced data usage for mobile users

## Troubleshooting

### Assets Not Caching
1. Check that filenames contain hashes
2. Verify Cache-Control headers are present
3. Ensure Vercel deployment is using the latest config

### Cache Not Updating
1. Verify build ID is changing between deployments
2. Check that content has actually changed
3. Clear browser cache for testing

### Performance Issues
1. Run `npm run verify-assets` to check configuration
2. Verify all static assets are being hashed
3. Check that dynamic content is not being cached

## Configuration Files

### next.config.js
- Custom build ID generation
- Comprehensive header configuration
- Webpack optimizations

### vercel.json
- Edge-level caching headers
- API route caching rules
- Static asset optimization

### scripts/verify-hashed-assets.js
- Automated verification script
- Build validation
- Configuration checking

## Best Practices

1. **Never use query strings** for cache busting
2. **Always verify** hashed filenames after deployment
3. **Test cache behavior** in production
4. **Monitor performance** metrics
5. **Keep build IDs unique** for each deployment

## Monitoring

Use these tools to monitor caching effectiveness:
- Browser dev tools Network tab
- Vercel Analytics
- Core Web Vitals
- Lighthouse performance audits 