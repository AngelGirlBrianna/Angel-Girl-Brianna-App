import React, { useState, useEffect, useMemo } from 'react';
import { 
  Search, 
  Moon, 
  Sun, 
  Bell, 
  ArrowLeft, 
  Mail, 
  ExternalLink, 
  RefreshCcw,
  X,
  ChevronRight,
  Settings,
  Layers,
  Download,
  Volume2,
  VolumeX,
  Trash2,
  BookOpen
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { format } from 'date-fns';
import parse, { HTMLReactParserOptions, Element } from 'html-react-parser';
import { cn } from './lib/utils';
import { WordPressPost, WordPressPage, Notification } from './types';

const WP_API_URL = 'https://angelgirlbrianna.com/wp-json/wp/v2/posts?_embed';
const WP_PAGES_URL = 'https://angelgirlbrianna.com/wp-json/wp/v2/pages';
const FETCH_INTERVAL = 12 * 60 * 60 * 1000; // 12 hours in ms
const CACHE_KEY = 'agb_posts_cache';
const NOTIFS_KEY = 'agb_notifications';

export default function App() {
  const [posts, setPosts] = useState<WordPressPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedPost, setSelectedPost] = useState<WordPressPost | null>(null);
  const [darkMode, setDarkMode] = useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('theme') === 'dark';
    }
    return false;
  });
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [showNotifs, setShowNotifs] = useState(false);
  const [view, setView] = useState<'home' | 'about' | 'contact' | 'pages' | 'settings'>('home');
  const [pages, setPages] = useState<WordPressPage[]>([]);
  const [loadingPages, setLoadingPages] = useState(false);
  const [ttsEnabled, setTtsEnabled] = useState(() => localStorage.getItem('tts_enabled') === 'true');
  const [pushEnabled, setPushEnabled] = useState(() => localStorage.getItem('push_enabled') === 'true');
  const [lastFetchTime, setLastFetchTime] = useState(() => Number(localStorage.getItem('last_fetch_time')) || 0);

  // Load cache and theme on mount
  useEffect(() => {
    const cached = localStorage.getItem(CACHE_KEY);
    if (cached) {
      setPosts(JSON.parse(cached));
      setLoading(false);
    }

    const savedNotifs = localStorage.getItem(NOTIFS_KEY);
    if (savedNotifs) {
      try {
        setNotifications(JSON.parse(savedNotifs).map((n: any) => ({
          ...n,
          timestamp: new Date(n.timestamp)
        })));
      } catch (e) {
        console.error("Failed to parse notifications", e);
      }
    }

    fetchPosts();
  }, []);

  // Save theme
  useEffect(() => {
    localStorage.setItem('theme', darkMode ? 'dark' : 'light');
    if (darkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [darkMode]);

  // Save notifications
  useEffect(() => {
    localStorage.setItem(NOTIFS_KEY, JSON.stringify(notifications));
  }, [notifications]);

  // Save settings
  useEffect(() => {
    localStorage.setItem('tts_enabled', String(ttsEnabled));
    localStorage.setItem('push_enabled', String(pushEnabled));
  }, [ttsEnabled, pushEnabled]);

  // Background fetch logic (every 12 hours)
  useEffect(() => {
    const checkNewPosts = () => {
      const now = Date.now();
      if (now - lastFetchTime >= FETCH_INTERVAL) {
        fetchPosts();
        setLastFetchTime(now);
        localStorage.setItem('last_fetch_time', String(now));
      }
    };

    const interval = setInterval(checkNewPosts, 60000); // Check every minute if it's time
    return () => clearInterval(interval);
  }, [lastFetchTime]);

  const [toast, setToast] = useState<{ message: string; postId?: number } | null>(null);

  const fetchPages = async () => {
    try {
      setLoadingPages(true);
      const res = await fetch(WP_PAGES_URL);
      if (!res.ok) throw new Error('Failed to fetch pages');
      const data: WordPressPage[] = await res.json();
      setPages(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingPages(false);
    }
  };

  useEffect(() => {
    if (view === 'pages') {
      fetchPages();
    }
  }, [view]);

  const clearCache = () => {
    localStorage.removeItem(CACHE_KEY);
    setPosts([]);
    setToast({ message: 'Cache cleared successfully' });
    setTimeout(() => setToast(null), 3000);
  };

  const speakText = (text: string) => {
    if (!ttsEnabled) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    window.speechSynthesis.speak(utterance);
  };

  const stopSpeaking = () => {
    window.speechSynthesis.cancel();
  };

  const saveImage = async (url: string, filename: string) => {
    try {
      const response = await fetch(url);
      const blob = await response.blob();
      const blobUrl = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = blobUrl;
      link.download = filename || 'agb-image.png';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(blobUrl);
      setToast({ message: 'Image saved successfully' });
      setTimeout(() => setToast(null), 3000);
    } catch (err) {
      console.error('Failed to save image', err);
      window.open(url, '_blank'); // Fallback
    }
  };

  const fetchPosts = async () => {
    try {
      setLoading(true);
      const res = await fetch(WP_API_URL);
      if (!res.ok) throw new Error('Failed to fetch posts');
      const data: WordPressPost[] = await res.json();
      
      // Check for new posts to trigger notifications
      const cached = localStorage.getItem(CACHE_KEY);
      if (cached) {
        const oldPosts: WordPressPost[] = JSON.parse(cached);
        const newPosts = data.filter(p => !oldPosts.some(op => op.id === p.id));
        
        if (newPosts.length > 0) {
          const newNotifs: Notification[] = newPosts.map(p => ({
            id: Math.random().toString(36).substr(2, 9),
            title: 'New Post!',
            message: p.title.rendered,
            timestamp: new Date(),
            read: false,
            postId: p.id
          }));
          setNotifications(prev => [...newNotifs, ...prev]);
          setToast({ message: `New post: ${newPosts[0].title.rendered}`, postId: newPosts[0].id });
          setTimeout(() => setToast(null), 5000);
        }
      }

      setPosts(data);
      localStorage.setItem(CACHE_KEY, JSON.stringify(data));
      setError(null);
    } catch (err) {
      console.error(err);
      setError('Could not refresh posts. Showing cached content.');
    } finally {
      setLoading(false);
    }
  };

  const filteredPosts = useMemo(() => {
    return posts.filter(post => 
      post.title.rendered.toLowerCase().includes(searchQuery.toLowerCase()) ||
      post.excerpt.rendered.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [posts, searchQuery]);

  const toggleRead = (id: string) => {
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: true } : n));
  };

  const unreadCount = notifications.filter(n => !n.read).length;

  const renderHome = () => (
    <div className="space-y-6">
      <div className="w-full rounded-3xl overflow-hidden border border-slate-200 dark:border-slate-800 shadow-sm bg-white dark:bg-slate-900">
        <img 
          src="https://i0.wp.com/angelgirlbrianna.com/wp-content/uploads/2025/12/cropped-Angel-Girl-Brianna-blog-header-improved.png" 
          alt="Angel Girl Brianna Banner"
          className="w-full h-auto object-cover"
          referrerPolicy="no-referrer"
        />
      </div>

      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-slate-900 dark:text-white">Latest Updates</h2>
        <button 
          onClick={fetchPosts}
          disabled={loading}
          className="p-2 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
        >
          <RefreshCcw className={cn("w-5 h-5 text-blue-600", loading && "animate-spin")} />
        </button>
      </div>

      {error && (
        <div className="p-4 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl text-amber-800 dark:text-amber-200 text-sm">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredPosts.map((post) => {
          const featuredImage = post._embedded?.['wp:featuredmedia']?.[0]?.source_url;
          return (
            <motion.div
              key={post.id}
              layoutId={`post-${post.id}`}
              onClick={() => setSelectedPost(post)}
              className="group cursor-pointer bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden hover:shadow-xl hover:shadow-blue-500/10 transition-all duration-300 flex flex-col"
            >
              {featuredImage && (
                <div className="aspect-video overflow-hidden">
                  <img 
                    src={featuredImage} 
                    alt={post.title.rendered}
                    referrerPolicy="no-referrer"
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                  />
                </div>
              )}
              <div className="p-5 flex flex-col flex-grow">
                <span className="text-xs font-medium text-blue-600 dark:text-blue-400 mb-2">
                  {format(new Date(post.date), 'MMMM d, yyyy')}
                </span>
                <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-3 line-clamp-2 group-hover:text-blue-600 transition-colors">
                  {parse(post.title.rendered)}
                </h3>
                <div className="text-slate-600 dark:text-slate-400 text-sm line-clamp-3 mb-4 flex-grow">
                  {parse(post.excerpt.rendered)}
                </div>
                <div className="flex items-center text-blue-600 dark:text-blue-400 font-semibold text-sm">
                  Read Full Post <ChevronRight className="w-4 h-4 ml-1" />
                </div>
              </div>
            </motion.div>
          );
        })}
      </div>

      {filteredPosts.length === 0 && !loading && (
        <div className="text-center py-20">
          <div className="bg-slate-100 dark:bg-slate-800 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
            <Search className="w-8 h-8 text-slate-400" />
          </div>
          <p className="text-slate-500 dark:text-slate-400">No posts found matching your search.</p>
        </div>
      )}
    </div>
  );

  const renderPostDetail = (post: WordPressPost) => {
    const featuredImage = post._embedded?.['wp:featuredmedia']?.[0]?.source_url;

    const options: HTMLReactParserOptions = {
      replace: (domNode) => {
        if (domNode instanceof Element && domNode.attribs) {
          const className = domNode.attribs.class || '';
          
          // Suppress Jetpack prompt images and "View all responses" links
          if (
            className.includes('jetpack-blogging-prompt__answers') ||
            className.includes('wp-block-jetpack-comment-author-avatars') ||
            className.includes('sharedaddy') ||
            className.includes('jp-relatedposts')
          ) {
            return <></>;
          }

          // Ensure all images in content have no-referrer and are responsive
          if (domNode.name === 'img') {
            const { src, alt, class: imgClass, ...rest } = domNode.attribs;
            return (
              <div className="relative group/img my-8">
                <img 
                  src={src} 
                  alt={alt || ''} 
                  referrerPolicy="no-referrer"
                  className={cn("rounded-2xl shadow-lg w-full h-auto", imgClass)}
                  {...rest}
                />
                <button 
                  onClick={() => saveImage(src, `agb-post-image-${Date.now()}.png`)}
                  className="absolute top-4 right-4 p-3 bg-white/90 dark:bg-black/90 backdrop-blur-md rounded-full shadow-xl opacity-0 group-hover/img:opacity-100 transition-opacity flex items-center gap-2 text-xs font-bold text-blue-600 dark:text-blue-400"
                >
                  <Download className="w-4 h-4" /> Save Image
                </button>
              </div>
            );
          }
        }
      },
    };

    return (
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 20 }}
        className="max-w-4xl mx-auto"
      >
        <div className="flex items-center justify-between mb-8">
          <button 
            onClick={() => { setSelectedPost(null); stopSpeaking(); }}
            className="flex items-center text-blue-600 dark:text-blue-400 hover:underline font-medium"
          >
            <ArrowLeft className="w-4 h-4 mr-2" /> Back to Feed
          </button>

          {ttsEnabled && (
            <div className="flex gap-2">
              <button 
                onClick={() => speakText(post.content.rendered.replace(/<[^>]*>/g, ''))}
                className="p-2 rounded-full bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 hover:bg-blue-200 transition-colors"
                title="Read Post Aloud"
              >
                <Volume2 className="w-5 h-5" />
              </button>
              <button 
                onClick={stopSpeaking}
                className="p-2 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200 transition-colors"
                title="Stop Reading"
              >
                <VolumeX className="w-5 h-5" />
              </button>
            </div>
          )}
        </div>

        <article className="bg-white dark:bg-slate-900 rounded-3xl p-6 md:p-10 border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
          {featuredImage && (
            <div className="relative group/featured -mx-6 md:-mx-10 -mt-6 md:-mt-10 mb-8">
              <img 
                src={featuredImage} 
                alt={post.title.rendered}
                referrerPolicy="no-referrer"
                className="w-full h-auto object-cover max-h-[500px]"
              />
              <button 
                onClick={() => saveImage(featuredImage, `agb-featured-${post.id}.png`)}
                className="absolute top-4 right-4 p-3 bg-white/90 dark:bg-black/90 backdrop-blur-md rounded-full shadow-xl opacity-0 group-hover/featured:opacity-100 transition-opacity flex items-center gap-2 text-xs font-bold text-blue-600 dark:text-blue-400"
              >
                <Download className="w-4 h-4" /> Save Image
              </button>
            </div>
          )}

          <header className="mb-8">
            <div className="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400 mb-4">
              <span className="bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider">
                Article
              </span>
              <span>•</span>
              <time>{format(new Date(post.date), 'MMMM d, yyyy')}</time>
            </div>
            <h1 className="text-3xl md:text-5xl font-black text-slate-900 dark:text-white leading-tight mb-6">
              {parse(post.title.rendered)}
            </h1>
          </header>

          <div className="prose prose-slate dark:prose-invert max-w-none prose-img:rounded-2xl prose-a:text-blue-600 dark:prose-a:text-blue-400">
            {parse(post.content.rendered, options)}
          </div>

          <footer className="mt-12 pt-8 border-t border-slate-100 dark:border-slate-800 flex flex-wrap gap-4 items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full overflow-hidden bg-blue-600 flex items-center justify-center">
                <img 
                  src="https://i0.wp.com/angelgirlbrianna.com/wp-content/uploads/2025/12/cropped-Angel-Girl-Brianna-blog-header-improved.png" 
                  alt="AGB Icon"
                  className="w-full h-full object-cover"
                  referrerPolicy="no-referrer"
                />
              </div>
              <div>
                <p className="text-sm font-bold text-slate-900 dark:text-white">Angel Girl Brianna</p>
                <p className="text-xs text-slate-500">Author</p>
              </div>
            </div>
            <a 
              href={post.link} 
              target="_blank" 
              rel="noopener noreferrer"
              className="flex items-center gap-2 text-sm font-medium text-slate-500 hover:text-blue-600 transition-colors"
            >
              View on Website <ExternalLink className="w-4 h-4" />
            </a>
          </footer>
        </article>
      </motion.div>
    );
  };

  const renderPages = () => (
    <div className="max-w-4xl mx-auto py-6 space-y-8">
      <div className="flex items-center justify-between">
        <h2 className="text-3xl font-black text-slate-900 dark:text-white">Site Pages</h2>
        <button 
          onClick={fetchPages}
          disabled={loadingPages}
          className="p-2 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
        >
          <RefreshCcw className={cn("w-5 h-5 text-blue-600", loadingPages && "animate-spin")} />
        </button>
      </div>

      {loadingPages ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="h-32 bg-slate-100 dark:bg-slate-800 animate-pulse rounded-2xl" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {pages.map(page => (
            <motion.div 
              key={page.id}
              whileHover={{ y: -4 }}
              className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm hover:shadow-md transition-all group"
            >
              <div className="flex items-start justify-between mb-4">
                <div className="p-3 bg-blue-50 dark:bg-blue-900/20 rounded-xl text-blue-600 dark:text-blue-400">
                  <BookOpen className="w-6 h-6" />
                </div>
                <a 
                  href={page.link} 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="p-2 text-slate-400 hover:text-blue-600 transition-colors"
                >
                  <ExternalLink className="w-5 h-5" />
                </a>
              </div>
              <h3 className="text-xl font-bold text-slate-900 dark:text-white mb-2 group-hover:text-blue-600 transition-colors">
                {parse(page.title.rendered)}
              </h3>
              <p className="text-sm text-slate-500 dark:text-slate-400 line-clamp-2">
                View the full content of this page on AngelGirlBrianna.com
              </p>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );

  const renderSettings = () => (
    <div className="max-w-2xl mx-auto py-10 space-y-8">
      <h2 className="text-3xl font-black text-slate-900 dark:text-white mb-8">Settings</h2>
      
      <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-sm">
        <div className="p-6 space-y-6">
          {/* Push Notifications */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-blue-50 dark:bg-blue-900/20 rounded-xl text-blue-600 dark:text-blue-400">
                <Bell className="w-6 h-6" />
              </div>
              <div>
                <p className="font-bold text-slate-900 dark:text-white">Push Notifications</p>
                <p className="text-sm text-slate-500">Check for new posts every 12 hours</p>
              </div>
            </div>
            <button 
              onClick={() => setPushEnabled(!pushEnabled)}
              className={cn(
                "w-14 h-8 rounded-full transition-colors relative",
                pushEnabled ? "bg-blue-600" : "bg-slate-200 dark:bg-slate-700"
              )}
            >
              <div className={cn(
                "absolute top-1 w-6 h-6 bg-white rounded-full transition-all shadow-sm",
                pushEnabled ? "left-7" : "left-1"
              )} />
            </button>
          </div>

          <div className="h-px bg-slate-100 dark:bg-slate-800" />

          {/* TTS Reading */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-blue-50 dark:bg-blue-900/20 rounded-xl text-blue-600 dark:text-blue-400">
                <Volume2 className="w-6 h-6" />
              </div>
              <div>
                <p className="font-bold text-slate-900 dark:text-white">TTS Reading Feature</p>
                <p className="text-sm text-slate-500">Enable text-to-speech for posts</p>
              </div>
            </div>
            <button 
              onClick={() => setTtsEnabled(!ttsEnabled)}
              className={cn(
                "w-14 h-8 rounded-full transition-colors relative",
                ttsEnabled ? "bg-blue-600" : "bg-slate-200 dark:bg-slate-700"
              )}
            >
              <div className={cn(
                "absolute top-1 w-6 h-6 bg-white rounded-full transition-all shadow-sm",
                ttsEnabled ? "left-7" : "left-1"
              )} />
            </button>
          </div>

          <div className="h-px bg-slate-100 dark:bg-slate-800" />

          {/* Clear Cache */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-red-50 dark:bg-red-900/20 rounded-xl text-red-600 dark:text-red-400">
                <Trash2 className="w-6 h-6" />
              </div>
              <div>
                <p className="font-bold text-slate-900 dark:text-white">Clear Cache</p>
                <p className="text-sm text-slate-500">Remove all stored posts and data</p>
              </div>
            </div>
            <button 
              onClick={clearCache}
              className="px-4 py-2 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 rounded-xl font-bold text-sm hover:bg-red-100 transition-colors"
            >
              Clear
            </button>
          </div>
        </div>
      </div>

      <div className="p-6 bg-blue-50 dark:bg-blue-900/10 rounded-3xl border border-blue-100 dark:border-blue-900/30">
        <p className="text-sm text-blue-800 dark:text-blue-200 leading-relaxed">
          <strong>Note:</strong> Push notifications require browser permission. When enabled, the app will check for updates in the background every 12 hours while the app is active.
        </p>
      </div>
    </div>
  );

  const renderContact = () => (
    <div className="max-w-2xl mx-auto py-10">
      <div className="bg-white dark:bg-slate-900 rounded-3xl p-8 border border-slate-200 dark:border-slate-800 text-center">
        <div className="w-20 h-20 bg-blue-100 dark:bg-blue-900/30 rounded-full flex items-center justify-center mx-auto mb-6">
          <Mail className="w-10 h-10 text-blue-600 dark:text-blue-400" />
        </div>
        <h2 className="text-3xl font-black text-slate-900 dark:text-white mb-4">Get in Touch</h2>
        <p className="text-slate-600 dark:text-slate-400 mb-8">
          Have questions or feedback? Feel free to reach out to Angel Girl Brianna directly.
        </p>
        <div className="bg-slate-50 dark:bg-slate-800/50 p-6 rounded-2xl border border-slate-100 dark:border-slate-800">
          <p className="text-xs uppercase font-bold tracking-widest text-slate-400 mb-2">Email Address</p>
          <a 
            href="mailto:AGB@AngelGirlBrianna.com" 
            className="text-2xl font-bold text-blue-600 dark:text-blue-400 hover:underline break-all"
          >
            AGB@AngelGirlBrianna.com
          </a>
        </div>
        <div className="mt-10 flex justify-center gap-6">
          <a href="https://angelgirlbrianna.com" target="_blank" className="p-3 rounded-full bg-slate-100 dark:bg-slate-800 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors">
            <ExternalLink className="w-6 h-6 text-slate-600 dark:text-slate-400" />
          </a>
        </div>
      </div>
    </div>
  );

  return (
    <div className={cn("min-h-screen transition-colors duration-300", darkMode ? "bg-black" : "bg-slate-50")}>
      {/* Header */}
      <header className="sticky top-0 z-40 bg-white/80 dark:bg-black/80 backdrop-blur-xl border-b border-slate-200 dark:border-slate-800">
        <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between gap-4">
          <div className="flex items-center gap-2 cursor-pointer" onClick={() => { setView('home'); setSelectedPost(null); }}>
            <div className="w-8 h-8 rounded-lg overflow-hidden flex items-center justify-center bg-blue-600">
              <img 
                src="https://i0.wp.com/angelgirlbrianna.com/wp-content/uploads/2025/12/cropped-Angel-Girl-Brianna-blog-header-improved.png" 
                alt="AGB Icon"
                className="w-full h-full object-cover"
                referrerPolicy="no-referrer"
              />
            </div>
            <h1 className="text-lg font-black tracking-tighter text-slate-900 dark:text-white hidden sm:block">
              ANGEL GIRL BRIANNA
            </h1>
          </div>

          <a 
            href="https://angelgirlbrianna.com" 
            target="_blank" 
            rel="noopener noreferrer"
            className="hidden lg:flex items-center gap-2 text-xs font-bold text-slate-500 hover:text-blue-600 transition-colors uppercase tracking-widest"
          >
            Live Site <ExternalLink className="w-3 h-3" />
          </a>

          <div className="flex-grow max-w-md relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input 
              type="text"
              placeholder="Search posts..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-slate-100 dark:bg-slate-900 border-none rounded-full py-2 pl-10 pr-4 text-sm focus:ring-2 focus:ring-blue-500 dark:text-white transition-all"
            />
          </div>

          <div className="flex items-center gap-1 sm:gap-3">
            <button 
              onClick={() => setView('pages')}
              className={cn(
                "p-2 rounded-full transition-colors",
                view === 'pages' ? "bg-blue-100 text-blue-600" : "text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
              )}
              title="Site Pages"
            >
              <Layers className="w-5 h-5" />
            </button>

            <button 
              onClick={() => setDarkMode(!darkMode)}
              className="p-2 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-400 transition-colors"
            >
              {darkMode ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
            </button>
            
            <div className="relative">
              <button 
                onClick={() => setShowNotifs(!showNotifs)}
                className="p-2 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-400 transition-colors"
              >
                <Bell className="w-5 h-5" />
                {unreadCount > 0 && (
                  <span className="absolute top-1.5 right-1.5 w-4 h-4 bg-blue-600 text-white text-[10px] font-bold flex items-center justify-center rounded-full border-2 border-white dark:border-black">
                    {unreadCount}
                  </span>
                )}
              </button>

              <AnimatePresence>
                {showNotifs && (
                  <motion.div 
                    initial={{ opacity: 0, y: 10, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 10, scale: 0.95 }}
                    className="absolute right-0 mt-2 w-80 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl z-50 overflow-hidden"
                  >
                    <div className="p-4 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center">
                      <h3 className="font-bold text-slate-900 dark:text-white">Notifications</h3>
                      <div className="flex items-center gap-3">
                        <button onClick={() => setNotifications([])} className="text-xs text-blue-600 hover:underline">Clear all</button>
                        <button onClick={() => setShowNotifs(false)} className="p-1 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800">
                          <X className="w-4 h-4 text-slate-400" />
                        </button>
                      </div>
                    </div>
                    <div className="max-h-96 overflow-y-auto">
                      {notifications.length === 0 ? (
                        <div className="p-8 text-center text-slate-500 text-sm">
                          No notifications yet.
                        </div>
                      ) : (
                        notifications.map(notif => (
                          <div 
                            key={notif.id} 
                            onClick={() => {
                              if (notif.postId) {
                                const post = posts.find(p => p.id === notif.postId);
                                if (post) setSelectedPost(post);
                              }
                              toggleRead(notif.id);
                              setShowNotifs(false);
                            }}
                            className={cn(
                              "p-4 border-b border-slate-50 dark:border-slate-800 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors",
                              !notif.read && "bg-blue-50/50 dark:bg-blue-900/10"
                            )}
                          >
                            <div className="flex justify-between items-start mb-1">
                              <p className="font-bold text-sm text-slate-900 dark:text-white">{notif.title}</p>
                              <span className="text-[10px] text-slate-400">{format(notif.timestamp, 'HH:mm')}</span>
                            </div>
                            <p className="text-xs text-slate-600 dark:text-slate-400 line-clamp-2">{parse(notif.message)}</p>
                          </div>
                        ))
                      )}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            <button 
              onClick={() => setView('settings')}
              className={cn(
                "p-2 rounded-full transition-colors",
                view === 'settings' ? "bg-blue-600 text-white" : "hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-400"
              )}
              title="Settings"
            >
              <Settings className="w-5 h-5" />
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 py-8">
        <AnimatePresence mode="wait">
          {selectedPost ? (
            <motion.div 
              key="detail"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 20 }}
            >
              {renderPostDetail(selectedPost)}
            </motion.div>
          ) : (
            <motion.div
              key={view}
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.2 }}
            >
              {view === 'home' && renderHome()}
              {view === 'pages' && renderPages()}
              {view === 'settings' && renderSettings()}
              {view === 'contact' && renderContact()}
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* Footer / Navigation */}
      <footer className="mt-20 border-t border-slate-200 dark:border-slate-800 py-12 px-4">
        <div className="max-w-7xl mx-auto grid grid-cols-1 md:grid-cols-3 gap-10">
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 bg-blue-600 rounded flex items-center justify-center text-white font-black text-[10px]">
                AGB
              </div>
              <h3 className="font-black text-slate-900 dark:text-white tracking-tighter">ANGEL GIRL BRIANNA</h3>
            </div>
            <p className="text-sm text-slate-500 dark:text-slate-400 max-w-xs leading-relaxed">
              Stay updated with the latest news and insights from Angel Girl Brianna. A modern news experience.
            </p>
          </div>
          
          <div className="space-y-4">
            <h4 className="font-bold text-slate-900 dark:text-white text-sm uppercase tracking-widest">Quick Links</h4>
            <ul className="space-y-2 text-sm text-slate-500 dark:text-slate-400">
              <li><button onClick={() => { setView('home'); setSelectedPost(null); }} className="hover:text-blue-600 transition-colors">Latest Posts</button></li>
              <li><button onClick={() => setView('pages')} className="hover:text-blue-600 transition-colors">Site Pages</button></li>
              <li><button onClick={() => setView('settings')} className="hover:text-blue-600 transition-colors">App Settings</button></li>
              <li><button onClick={() => setView('contact')} className="hover:text-blue-600 transition-colors">Contact Support</button></li>
            </ul>
          </div>

          <div className="space-y-4">
            <h4 className="font-bold text-slate-900 dark:text-white text-sm uppercase tracking-widest">Connect</h4>
            <div className="flex gap-4">
              <a href="mailto:AGB@AngelGirlBrianna.com" className="w-10 h-10 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center hover:bg-blue-600 hover:text-white transition-all">
                <Mail className="w-5 h-5" />
              </a>
              <a href="https://angelgirlbrianna.com" target="_blank" className="w-10 h-10 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center hover:bg-blue-600 hover:text-white transition-all">
                <ExternalLink className="w-5 h-5" />
              </a>
            </div>
            <p className="text-xs text-slate-400">© {new Date().getFullYear()} Angel Girl Brianna News. All rights reserved.</p>
          </div>
        </div>
      </footer>

      {/* Toast Notification */}
      <AnimatePresence>
        {toast && (
          <motion.div 
            initial={{ opacity: 0, y: 50 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 50 }}
            onClick={() => {
              if (toast.postId) {
                const post = posts.find(p => p.id === toast.postId);
                if (post) setSelectedPost(post);
              }
              setToast(null);
            }}
            className="fixed bottom-8 left-1/2 -translate-x-1/2 z-50 bg-blue-600 text-white px-6 py-3 rounded-full shadow-2xl flex items-center gap-3 cursor-pointer hover:bg-blue-700 transition-colors"
          >
            <Bell className="w-4 h-4" />
            <span className="text-sm font-bold">{toast.message}</span>
            <X className="w-4 h-4 ml-2 opacity-50" onClick={(e) => { e.stopPropagation(); setToast(null); }} />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Loading Overlay */}
      {loading && posts.length === 0 && (
        <div className="fixed inset-0 z-50 bg-white/80 dark:bg-black/80 backdrop-blur-sm flex flex-col items-center justify-center">
          <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mb-4"></div>
          <p className="text-slate-600 dark:text-slate-400 font-medium">Fetching latest updates...</p>
        </div>
      )}
    </div>
  );
}
