import { useState } from 'react';
import { Button } from "@/components/ui/button";
import { Menu } from "lucide-react";
import { useAuth } from '@/context/AuthContext';
import { Link, useNavigate } from 'react-router-dom';

const Navbar = () => {
  const [isOpen, setIsOpen] = useState(false);
  const { authState, signOut } = useAuth();
  const isAuthenticated = !!authState.user;
  const navigate = useNavigate(); // <-- added

  const handleSignOut = async () => {
    await signOut();
    navigate("/"); // <-- redirect to home
  };

  return (
    <header className="w-full py-4 bg-white bg-opacity-90 backdrop-blur-sm fixed top-0 left-0 right-0 z-50">
      <div className="container flex items-center justify-between">
        <div className="flex items-center">
          <div className="text-deep-blue font-semibold text-xl">MindEase</div>
        </div>

        {/* Desktop Navigation */}
        <nav className="hidden md:flex items-center space-x-8">
          <a href="#features" className="text-neutral-dark hover:text-deep-blue transition-colors">
            Features
          </a>
          <a href="#how-it-works" className="text-neutral-dark hover:text-deep-blue transition-colors">
            How It Works
          </a>
          <a href="#technology" className="text-neutral-dark hover:text-deep-blue transition-colors">
            Technology
          </a>
          <a href="#resources" className="text-neutral-dark hover:text-deep-blue transition-colors">
            Resources
          </a>

          {isAuthenticated ? (
            <>
              <Button variant="ghost" className="text-neutral-dark hover:text-deep-blue transition-colors" asChild>
                <Link to="/dashboard">Dashboard</Link>
              </Button>
              <Button variant="outline" onClick={handleSignOut}>
                Sign Out
              </Button>
            </>
          ) : (
            <Button variant="default" className="ml-4" asChild>
              <Link to="/auth">Sign In</Link>
            </Button>
          )}
        </nav>

        {/* Mobile Menu Button */}
        <button
          className="p-2 rounded-md md:hidden focus:outline-none"
          onClick={() => setIsOpen(!isOpen)}
          aria-label="Toggle menu"
          aria-expanded={isOpen}
        >
          <Menu className="h-6 w-6 text-neutral-dark" />
        </button>
      </div>

      {/* Mobile Navigation */}
      {isOpen && (
        <div className="md:hidden fixed inset-0 z-50 bg-white px-6 py-8 pt-24">
          <nav className="flex flex-col space-y-6 text-center">
            <a
              href="#features"
              className="text-lg font-medium text-neutral-dark hover:text-deep-blue"
              onClick={() => setIsOpen(false)}
            >
              Features
            </a>
            <a
              href="#how-it-works"
              className="text-lg font-medium text-neutral-dark hover:text-deep-blue"
              onClick={() => setIsOpen(false)}
            >
              How It Works
            </a>
            <a
              href="#technology"
              className="text-lg font-medium text-neutral-dark hover:text-deep-blue"
              onClick={() => setIsOpen(false)}
            >
              Technology
            </a>
            <a
              href="#resources"
              className="text-lg font-medium text-neutral-dark hover:text-deep-blue"
              onClick={() => setIsOpen(false)}
            >
              Resources
            </a>

            {isAuthenticated ? (
              <>
                <Link
                  to="/dashboard"
                  className="text-lg font-medium text-neutral-dark hover:text-deep-blue"
                  onClick={() => setIsOpen(false)}
                >
                  Dashboard
                </Link>
                <Button
                  variant="outline"
                  className="mt-6 w-full"
                  onClick={() => {
                    handleSignOut();
                    setIsOpen(false);
                  }}
                >
                  Sign Out
                </Button>
              </>
            ) : (
              <Button
                variant="default"
                className="mt-6 w-full"
                onClick={() => setIsOpen(false)}
                asChild
              >
                <Link to="/auth">Sign In</Link>
              </Button>
            )}
          </nav>
        </div>
      )}
    </header>
  );
};

export default Navbar;
